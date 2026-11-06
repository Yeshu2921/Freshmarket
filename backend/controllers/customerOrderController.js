
const db = require("../db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { receiptDirectory } = require("../middleware/customerOrderUpload");

const PAYMENT_METHODS = new Set([
  "Cash on Delivery",
  "CBE",
  "CBE Birr",
  "Dashen Bank",
  "Telebirr",
  "Bank of Abyssinia",
  "Awash Bank",
  "Cibbirr",
]);

const CASH_METHOD = "Cash on Delivery";

function removeUploadedReceipt(file) {
  if (!file?.path) return Promise.resolve();

  return fs.unlink(file.path).catch(() => {});
}

function createOrderNumber() {
  const date = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  return `FM-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

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

function getTrustedUnitPrice(product) {
  const sellingPrice = Number(product.selling_price);
  const discountPrice =
    product.discount_price === null
      ? null
      : Number(product.discount_price);

  if (
    discountPrice !== null &&
    Number.isFinite(discountPrice) &&
    discountPrice > 0 &&
    discountPrice < sellingPrice
  ) {
    return discountPrice;
  }

  return sellingPrice;
}

// POST /api/customer-orders
async function createCustomerOrder(req, res) {
  const fullName = String(req.body.fullName || "").trim();
  const phone = String(req.body.phone || "").trim();
  const deliveryLocation =
    String(req.body.deliveryLocation || "").trim() || null;
  const pin = String(req.body.pin || "");
  const paymentMethod = String(req.body.paymentMethod || "").trim();
  const items = normalizeItems(req.body.items);

  const isCash = paymentMethod === CASH_METHOD;

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

  if (!/^\d{4,6}$/.test(pin)) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "PIN must contain 4 to 6 digits.",
    });
  }

  if (!PAYMENT_METHODS.has(paymentMethod)) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "Please select a valid payment method.",
    });
  }

  if (!items) {
    await removeUploadedReceipt(req.file);

    return res.status(400).json({
      success: false,
      message: "The product list is invalid or empty.",
    });
  }

  if (!isCash && !req.file) {
    return res.status(400).json({
      success: false,
      message: "Upload a payment receipt for electronic payment.",
    });
  }

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

    const pinHash = await bcrypt.hash(pin, 12);

    // Phone is unique in customer_profiles.
    // A new order using the same phone updates the customer's PIN.
    const [profileResult] = await connection.execute(
      `INSERT INTO customer_profiles (full_name, phone, pin_hash)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         full_name = VALUES(full_name),
         pin_hash = VALUES(pin_hash)`,
      [fullName, phone, pinHash]
    );

    const customerId = profileResult.insertId;

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
          new Error(`Product ${requestedItem.productId} was not found.`),
          { statusCode: 400 }
        );
      }

      const product = products[0];

      if (String(product.status).trim().toLowerCase() !== "active") {
        throw Object.assign(
          new Error(`${product.name} is not currently available.`),
          { statusCode: 400 }
        );
      }

      // Check current stock when placing the order.
      // Stock will NOT be decreased here.
      // The worker approval process will check stock again.
      if (Number(product.quantity) < requestedItem.quantity) {
        throw Object.assign(
          new Error(`Not enough stock is available for ${product.name}.`),
          { statusCode: 400 }
        );
      }

      const unitPrice = getTrustedUnitPrice(product);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw Object.assign(
          new Error(`Invalid price for ${product.name}.`),
          { statusCode: 400 }
        );
      }

      const lineTotal = Number(
        (unitPrice * requestedItem.quantity).toFixed(2)
      );

      subtotal = Number((subtotal + lineTotal).toFixed(2));

      orderItems.push({
        productId: product.id,
        productName: product.name,
        productImage: product.product_image || null,
        unitPrice,
        quantity: requestedItem.quantity,
        lineTotal,
      });
    }

    // Delivery fee is currently zero until your delivery-fee rules are set.
    const deliveryFee = 0;
    const grandTotal = Number((subtotal + deliveryFee).toFixed(2));
    const orderNumber = createOrderNumber();

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

      // IMPORTANT:
      // Do not update products.quantity here.
      // Do not update products.quantity_sold here.
      // Both updates happen only after worker approval.
    }

    let receiptPath = null;

    if (req.file) {
      // Save only the relative private path in the database.
      receiptPath = path
        .relative(
          path.join(__dirname, "..", "private_uploads"),
          req.file.path
        )
        .split(path.sep)
        .join("/");
    }

    // Both electronic payments and cash payments start as Pending.
    // Cash is not marked paid until it is actually received.
    await connection.execute(
      `INSERT INTO customer_payments (
         order_id,
         payment_method,
         amount,
         receipt_path,
         payment_status
       )
       VALUES (?, ?, ?, ?, 'Pending')`,
      [orderId, paymentMethod, grandTotal, receiptPath]
    );

    await connection.commit();
    transactionStarted = false;

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
    if (connection) connection.release();
  }
}

module.exports = {
  createCustomerOrder,
};
