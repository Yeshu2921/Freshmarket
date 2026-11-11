const {createNotification,
} = require("./notificationController");
const db = require("../db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const CASH_METHOD = "Cash on Delivery";

// Remove an uploaded receipt if order creation fails.
function removeUploadedReceipt(file) {
  if (!file?.path) return Promise.resolve();

  return fs.unlink(file.path).catch(() => {});
}

// Generate a unique order number.
function createOrderNumber() {
  const date = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  return `FM-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// Validate and combine requested products.
function normalizeItems(value) {
  let items = value;

  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return null;
  }

  const combined = new Map();

  for (const item of items) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);

    if (
      !Number.isSafeInteger(productId) ||
      productId < 1 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000
    ) {
      return null;
    }

    combined.set(
      productId,
      (combined.get(productId) || 0) + quantity
    );
  }

  if ([...combined.values()].some((quantity) => quantity > 1000)) {
    return null;
  }

  return [...combined.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

// Always use selling_price for customer orders.
// discount_price is only the original price displayed to customers.
function getTrustedUnitPrice(product) {
  const sellingPrice = Number(product.selling_price);

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("Invalid product selling price");
  }

  return sellingPrice;
}

// Find or create a customer profile.
//
// Rules:
// Same phone + same PIN = reuse existing profile.
// Same phone + different PIN = create new profile.
// Different phone + same PIN = create new profile.
//
// A MySQL named lock serializes profile creation for the same phone.
async function findOrCreateCustomerProfile(
  connection,
  fullName,
  phone,
  pin
) {
  const lockName = `fm_customer_${crypto
    .createHash("sha256")
    .update(phone)
    .digest("hex")
    .slice(0, 40)}`;

  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK(?, 10) AS acquired",
    [lockName]
  );

  if (Number(lockRows[0]?.acquired) !== 1) {
    throw Object.assign(
      new Error("Customer profile is busy. Please try again."),
      { statusCode: 503 }
    );
  }

  try {
    // Find every profile using this phone number.
    const [existingProfiles] = await connection.execute(
      `SELECT id, full_name, phone, pin_hash
       FROM customer_profiles
       WHERE phone = ?
       ORDER BY id ASC
       FOR UPDATE`,
      [phone]
    );

    // Compare the submitted PIN with each existing profile.
    for (const profile of existingProfiles) {
      if (!profile.pin_hash) continue;

      const pinMatches = await bcrypt.compare(
        pin,
        profile.pin_hash
      );

      if (pinMatches) {
        // Same phone and same PIN.
        // Reuse this customer profile.
        await connection.execute(
          `UPDATE customer_profiles
           SET full_name = ?
           WHERE id = ?`,
          [fullName, profile.id]
        );

        return profile.id;
      }
    }

    // No matching phone + PIN combination exists.
    // Create a separate customer profile.
    const pinHash = await bcrypt.hash(pin, 12);

    const [profileResult] = await connection.execute(
      `INSERT INTO customer_profiles
         (full_name, phone, pin_hash)
       VALUES (?, ?, ?)`,
      [fullName, phone, pinHash]
    );

    return profileResult.insertId;
  } finally {
    // Release the named lock even if profile creation fails.
    await connection.execute(
      "SELECT RELEASE_LOCK(?)",
      [lockName]
    ).catch(() => {});
  }
}

// POST /api/customer-orders
async function createCustomerOrder(req, res) {
  const body = req.body || {};

  const fullName = String(body.fullName || "").trim();
  const phone = String(body.phone || "").replace(/\s+/g, "");
  const deliveryLocation =
    String(body.deliveryLocation || "").trim() || null;

  const pin = String(body.pin || "").trim();

  const paymentMethod = String(
    body.paymentMethod || ""
  ).trim();

  const items = normalizeItems(body.items);

  const isCash = paymentMethod === CASH_METHOD;

  // Validate customer information.
  if (
    !fullName ||
    fullName.length > 150 ||
    !phone ||
    phone.length > 30 ||
    (deliveryLocation && deliveryLocation.length > 500)
  ) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "Please provide valid customer and delivery information.",
    });
  }

  // Validate PIN.
  if (!/^\d{4,6}$/.test(pin)) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "PIN must contain 4 to 6 digits.",
    });
  }

  // Validate payment method.
  if (!paymentMethod || paymentMethod.length > 100) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "Please select a valid payment method.",
    });
  }

  // Validate product list.
  if (!items) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "The product list is invalid or empty.",
    });
  }

  // Electronic payment requires a receipt.
  if (!isCash && !req.file) {
    return res.status(400).json({
      success: false,
      message: "Upload a payment receipt for electronic payment.",
    });
  }

  // Cash on delivery does not require a receipt.
  if (isCash && req.file) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "A receipt is not required for cash on delivery.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Validate electronic payment methods.
    // Only owner-created active payment methods are accepted.
    if (!isCash) {
      const [availableMethods] = await connection.execute(
        `SELECT id
         FROM payment_methods
         WHERE method_name = ?
           AND is_active = 1
         LIMIT 1`,
        [paymentMethod]
      );

      if (availableMethods.length === 0) {
        throw Object.assign(
          new Error(
            "This payment method is unavailable. Please select another payment method."
          ),
          { statusCode: 400 }
        );
      }
    }

    // Find an existing matching profile or create a new one.
    const customerId = await findOrCreateCustomerProfile(
      connection,
      fullName,
      phone,
      pin
    );

    let subtotal = 0;
    const orderItems = [];

    // Validate products and current stock.
    for (const requestedItem of items) {
      const [products] = await connection.execute(
        `SELECT
           p.id,
           p.name,
           p.quantity,
           p.selling_price,
           p.discount_price,
           p.status,
           (
             SELECT pi.image_path
             FROM product_images pi
             WHERE pi.product_id = p.id
             ORDER BY pi.is_primary DESC, pi.id ASC
             LIMIT 1
           ) AS product_image
         FROM products p
         WHERE p.id = ?
         LIMIT 1
         FOR UPDATE`,
        [requestedItem.productId]
      );

      if (!products.length) {
        throw Object.assign(
          new Error(
            `Product ${requestedItem.productId} was not found.`
          ),
          { statusCode: 400 }
        );
      }

      const product = products[0];

      if (
        String(product.status).trim().toLowerCase() !== "active"
      ) {
        throw Object.assign(
          new Error(
            `${product.name} is not currently available.`
          ),
          { statusCode: 400 }
        );
      }

      // Check stock when placing the order.
      // Stock is deducted only after worker approval.
      if (Number(product.quantity) < requestedItem.quantity) {
        throw Object.assign(
          new Error(
            `Not enough stock is available for ${product.name}.`
          ),
          { statusCode: 400 }
        );
      }

      const unitPrice = getTrustedUnitPrice(product);

      const lineTotal = Number(
        (unitPrice * requestedItem.quantity).toFixed(2)
      );

      subtotal = Number(
        (subtotal + lineTotal).toFixed(2)
      );

      orderItems.push({
        productId: product.id,
        productName: product.name,
        productImage: product.product_image || null,
        unitPrice,
        quantity: requestedItem.quantity,
        lineTotal,
      });
    }

    // Delivery fee is currently zero.
    const deliveryFee = 0;

    const grandTotal = Number(
      (subtotal + deliveryFee).toFixed(2)
    );

    const orderNumber = createOrderNumber();

    // Create a new order for every successful submission.
    const [orderResult] = await connection.execute(
      `INSERT INTO customer_orders (
         order_number,
         customer_id,
         delivery_location,
         payment_method,
         subtotal,
         delivery_fee,
         grand_total,
         order_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        orderNumber,
        customerId,
        deliveryLocation,
        paymentMethod,
        subtotal,
        deliveryFee,
        grandTotal,
      ]
    );

    const orderId = orderResult.insertId;

    // Save order products.
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO customer_order_items (
           order_id,
           product_id,
           product_name,
           product_image,
           unit_price,
           quantity,
           line_total
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
          item.productName,
          item.productImage,
          item.unitPrice,
          item.quantity,
          item.lineTotal,
        ]
      );

      // Do not update products.quantity here.
      // Do not update products.quantity_sold here.
      // Both updates happen only after worker approval.
    }

    // Save the private receipt path.
    let receiptPath = null;

    if (req.file) {
      receiptPath = path
        .relative(
          path.join(__dirname, "..", "private_uploads"),
          req.file.path
        )
        .split(path.sep)
        .join("/");
    }

    // Create pending payment record.
    await connection.execute(
      `INSERT INTO customer_payments (
         order_id,
         payment_method,
         amount,
         receipt_path,
         payment_status
       )
       VALUES (?, ?, ?, ?, 'Pending')`,
      [
        orderId,
        paymentMethod,
        grandTotal,
        receiptPath,
      ]
    );

    // Commit the complete order first.
await connection.commit();
transactionStarted = false;

// =============================================
// NOTIFY ACTIVE OWNER AND WORKERS
// =============================================

try {
  // Find all active Owner and Worker accounts.
  const [recipients] = await db.execute(
    `SELECT id
     FROM users
     WHERE is_active = 1
       AND role IN ('owner', 'worker')`
  );

  // Save a notification for each recipient.
  // Socket.IO delivers it immediately when they are online.
  const notificationResults = await Promise.allSettled(
    recipients.map((recipient) =>
      createNotification({
        userId: recipient.id,
        type: "new_order",
        title: "New Customer Order",
        message: `Order ${orderNumber} has been submitted.`,
        referenceId: orderId,
      })
    )
  );

  notificationResults.forEach((result) => {
    if (result.status === "rejected") {
      console.error(
        "Could not create an order notification:",
        result.reason?.message
      );
    }
  });
} catch (notificationError) {
  // The order is already committed.
  // A notification failure must not make the customer think
  // the order itself failed.
  console.error(
    "Order notification error:",
    notificationError.message
  );
}

    return res.status(201).json({
      success: true,
      message: "Your order was placed successfully.",
      order: {
        id: orderId,
        order_number: orderNumber,
        order_status: "Pending",
        payment_method: paymentMethod,
        payment_status: "Pending",
        subtotal,
        delivery_fee: deliveryFee,
        grand_total: grandTotal,
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback().catch(() => {});
    }

    await removeUploadedReceipt(req.file);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      console.error("Duplicate customer order data:", error);

      return res.status(409).json({
        success: false,
        message: "A duplicate record was detected. Please try again.",
      });
    }

    console.error("Create customer order error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not place your order. Please try again.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  createCustomerOrder,
};
