
const { createNotification } = require("./notificationController");
const db = require("../db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const CASH_METHOD = "Cash on Delivery";

// =============================================
// TIDB ID GENERATORS
// =============================================

const ID_GENERATORS = {
  customerProfiles: "customer_profile_id_generator",
  customerOrders: "customer_order_id_generator",
  customerOrderItems: "customer_order_item_id_generator",
  customerPayments: "customer_payment_id_generator",
};

async function generateId(connection, generatorType) {
  const generatorTable = ID_GENERATORS[generatorType];

  if (!generatorTable) {
    throw new Error("Invalid ID generator type.");
  }

  const [result] = await connection.execute(
    `INSERT INTO ${generatorTable} () VALUES ()`
  );

  return result.insertId;
}

// =============================================
// REMOVE UPLOADED RECEIPT
// =============================================

function removeUploadedReceipt(file) {
  if (!file?.path) return Promise.resolve();

  return fs.unlink(file.path).catch(() => {});
}

// =============================================
// GENERATE UNIQUE ORDER NUMBER
// =============================================

function createOrderNumber() {
  const date = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  return `FM-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// =============================================
// VALIDATE AND COMBINE ORDER ITEMS
// =============================================

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

// =============================================
// GET TRUSTED PRODUCT PRICE
// =============================================

function getTrustedUnitPrice(product) {
  const sellingPrice = Number(product.selling_price);

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("Invalid product selling price");
  }

  return sellingPrice;
}

// =============================================
// FIND OR CREATE CUSTOMER PROFILE
// =============================================

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

    // Compare the submitted PIN with existing profiles.
    for (const profile of existingProfiles) {
      if (!profile.pin_hash) continue;

      const pinMatches = await bcrypt.compare(
        pin,
        profile.pin_hash
      );

      if (pinMatches) {
        // Same phone and same PIN: reuse profile.
        await connection.execute(
          `UPDATE customer_profiles
           SET full_name = ?
           WHERE id = ?`,
          [fullName, profile.id]
        );

        return profile.id;
      }
    }

    // No matching phone + PIN combination.
    // Create a new customer profile.
    const pinHash = await bcrypt.hash(pin, 12);

    const profileId = await generateId(
      connection,
      "customerProfiles"
    );

    await connection.execute(
      `INSERT INTO customer_profiles (
         id,
         full_name,
         phone,
         pin_hash
       )
       VALUES (?, ?, ?, ?)`,
      [profileId, fullName, phone, pinHash]
    );

    return profileId;
  } finally {
    // Always release the named lock.
    await connection.execute(
      "SELECT RELEASE_LOCK(?)",
      [lockName]
    ).catch(() => {});
  }
}

// =============================================
// POST /api/customer-orders
// CREATE CUSTOMER ORDER
// =============================================

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

  // =============================================
  // VALIDATE CUSTOMER INFORMATION
  // =============================================

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

  // =============================================
  // VALIDATE PIN
  // =============================================

  if (!/^\d{4,6}$/.test(pin)) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "PIN must contain 4 to 6 digits.",
    });
  }

  // =============================================
  // VALIDATE PAYMENT METHOD
  // =============================================

  if (!paymentMethod || paymentMethod.length > 100) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "Please select a valid payment method.",
    });
  }

  // =============================================
  // VALIDATE PRODUCT LIST
  // =============================================

  if (!items) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "The product list is invalid or empty.",
    });
  }

  // =============================================
  // ELECTRONIC PAYMENT REQUIRES RECEIPT
  // =============================================

  if (!isCash && !req.file) {
    return res.status(400).json({
      success: false,
      message: "Upload a payment receipt for electronic payment.",
    });
  }

  // =============================================
  // CASH PAYMENT DOES NOT REQUIRE RECEIPT
  // =============================================

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

    // =============================================
    // VALIDATE ELECTRONIC PAYMENT METHOD
    // =============================================

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

    // =============================================
    // FIND OR CREATE CUSTOMER PROFILE
    // =============================================

    const customerId = await findOrCreateCustomerProfile(
      connection,
      fullName,
      phone,
      pin
    );

    // =============================================
    // VALIDATE PRODUCTS AND CALCULATE SUBTOTAL
    // =============================================

    let subtotal = 0;

    const orderItems = [];

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

      // Check product status.
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

      // Check available stock.
      // Stock is deducted only after worker approval.
      if (Number(product.quantity) < requestedItem.quantity) {
        throw Object.assign(
          new Error(
            `Not enough stock is available for ${product.name}.`
          ),
          { statusCode: 400 }
        );
      }

      // Use trusted selling price.
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

    // =============================================
    // CALCULATE DELIVERY FEE AND GRAND TOTAL
    // =============================================

    const deliveryFee = 0;

    const grandTotal = Number(
      (subtotal + deliveryFee).toFixed(2)
    );

    // =============================================
    // GENERATE ORDER NUMBER AND ORDER ID
    // =============================================

    const orderNumber = createOrderNumber();

    const orderId = await generateId(
      connection,
      "customerOrders"
    );

    // =============================================
    // CREATE CUSTOMER ORDER
    // =============================================

    await connection.execute(
      `INSERT INTO customer_orders (
         id,
         order_number,
         customer_id,
         delivery_location,
         payment_method,
         subtotal,
         delivery_fee,
         grand_total,
         order_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        orderId,
        orderNumber,
        customerId,
        deliveryLocation,
        paymentMethod,
        subtotal,
        deliveryFee,
        grandTotal,
      ]
    );

    // =============================================
    // SAVE ORDER PRODUCTS
    // =============================================

    for (const item of orderItems) {
      const itemId = await generateId(
        connection,
        "customerOrderItems"
      );

      await connection.execute(
        `INSERT INTO customer_order_items (
           id,
           order_id,
           product_id,
           product_name,
           product_image,
           unit_price,
           quantity,
           line_total
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
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

    // =============================================
    // SAVE PRIVATE RECEIPT PATH
    // =============================================

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

    // =============================================
    // CREATE PENDING PAYMENT RECORD
    // =============================================

    const paymentId = await generateId(
      connection,
      "customerPayments"
    );

    await connection.execute(
      `INSERT INTO customer_payments (
         id,
         order_id,
         payment_method,
         amount,
         receipt_path,
         payment_status
       )
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [
        paymentId,
        orderId,
        paymentMethod,
        grandTotal,
        receiptPath,
      ]
    );

    // =============================================
    // COMMIT COMPLETE ORDER
    // =============================================

    await connection.commit();

    transactionStarted = false;

    // =============================================
    // NOTIFY ACTIVE OWNER AND WORKERS
    // =============================================

    try {
      const [recipients] = await db.execute(
        `SELECT id
         FROM users
         WHERE is_active = 1
           AND role IN ('owner', 'worker')`
      );

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
      // Order is already committed.
      // Notification failure must not make the customer
      // think the order itself failed.
      console.error(
        "Order notification error:",
        notificationError.message
      );
    }

    // =============================================
    // SUCCESS RESPONSE
    // =============================================

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
    // =============================================
    // ROLLBACK FAILED TRANSACTION
    // =============================================

    if (connection && transactionStarted) {
      await connection.rollback().catch(() => {});
    }

    // Remove uploaded receipt if order creation fails.
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

// =============================================
// EXPORTS
// =============================================

module.exports = {
  createCustomerOrder,
};
