
const db = require("../db");
const fs = require("fs");
const path = require("path");

// ======================================================
// CUSTOMER ORDER REVIEW ID GENERATOR
//
// TiDB requires an explicit ID because
// customer_order_reviews.id is not AUTO_INCREMENT.
//
// Generator table:
// customer_order_review_id_generator
// ======================================================

async function generateCustomerOrderReviewId(connection) {
  const [result] = await connection.query(
    "INSERT INTO customer_order_review_id_generator () VALUES ()"
  );

  return result.insertId;
}

// ======================================================
// PRIVATE PAYMENT RECEIPT FILE HELPERS
//
// Allowed folder:
// backend/private_uploads/customer/payment-receipts
//
// IMPORTANT:
// Never expose private_uploads using express.static().
// ======================================================

function getReceiptUploadDirectory() {
  return path.resolve(
    __dirname,
    "..",
    "private_uploads",
    "customer",
    "payment-receipts"
  );
}

// Resolve a stored receipt path and ensure it is inside
// the exact private payment receipt folder.
function getPrivateReceiptFile(receiptPath) {
  if (typeof receiptPath !== "string" || !receiptPath.trim()) {
    return null;
  }

  const backendRoot = path.resolve(__dirname, "..");
  const uploadDirectory = getReceiptUploadDirectory();

  const savedPath = receiptPath.trim().replace(/\\/g, "/");

  let filePath;

  if (path.isAbsolute(receiptPath.trim())) {
    filePath = path.resolve(receiptPath.trim());
  } else {
    const relativePath = savedPath.replace(/^\/+/, "");

    if (
      relativePath.startsWith(
        "private_uploads/customer/payment-receipts/"
      )
    ) {
      filePath = path.resolve(backendRoot, relativePath);
    } else if (
      relativePath.startsWith("customer/payment-receipts/")
    ) {
      filePath = path.resolve(
        backendRoot,
        "private_uploads",
        relativePath
      );
    } else if (
      !relativePath.includes("/") &&
      relativePath !== "." &&
      relativePath !== ".."
    ) {
      filePath = path.resolve(uploadDirectory, relativePath);
    } else {
      return null;
    }
  }

  const relativePath = path.relative(uploadDirectory, filePath);

  // Prevent path traversal and access outside the receipt folder.
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return filePath;
}

// Verify the actual file location using realpath.
// This also protects against symbolic-link escapes.
async function getVerifiedPrivateReceiptFile(receiptPath) {
  const filePath = getPrivateReceiptFile(receiptPath);

  if (!filePath) {
    return null;
  }

  try {
    const uploadDirectory = getReceiptUploadDirectory();

    const [realUploadDirectory, realFilePath] = await Promise.all([
      fs.promises.realpath(uploadDirectory),
      fs.promises.realpath(filePath),
    ]);

    const relativePath = path.relative(
      realUploadDirectory,
      realFilePath
    );

    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      return null;
    }

    const stats = await fs.promises.stat(realFilePath);

    if (!stats.isFile()) {
      return null;
    }

    return realFilePath;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Receipt verification error:", error);
    }

    return null;
  }
}

// Delete a receipt only when it is verified inside
// the exact private receipt folder.
async function deletePrivateReceiptFile(receiptPath) {
  const verifiedFilePath =
    await getVerifiedPrivateReceiptFile(receiptPath);

  if (!verifiedFilePath) {
    return;
  }

  try {
    await fs.promises.unlink(verifiedFilePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Receipt file deletion warning:", error);
    }
  }
}

// ======================================================
// GET /api/worker-orders
// Get recent Pending and Confirmed orders.
// ======================================================

const getWorkerOrders = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT
          co.id,
          co.order_number,
          co.customer_id,
          cp.full_name AS customer_name,
          cp.phone AS customer_phone,
          co.delivery_location,
          co.payment_method,
          co.subtotal,
          co.delivery_fee,
          co.grand_total,
          co.order_status,
          co.created_at,
          co.updated_at,
          pay.payment_status,
          pay.transaction_reference,
          CASE
            WHEN pay.receipt_path IS NOT NULL
                 AND pay.receipt_path != ''
            THEN 1
            ELSE 0
          END AS has_receipt,
          (
            SELECT COUNT(*)
            FROM customer_order_items coi
            WHERE coi.order_id = co.id
          ) AS total_items
       FROM customer_orders co
       LEFT JOIN customer_profiles cp
          ON cp.id = co.customer_id
       LEFT JOIN customer_payments pay
          ON pay.order_id = co.id
       WHERE co.order_status IN ('Pending', 'Confirmed')
       ORDER BY
         CASE
           WHEN co.order_status = 'Pending' THEN 0
           ELSE 1
         END,
         co.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get worker orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load customer orders.",
    });
  }
};

// ======================================================
// GET /api/worker-orders/:orderId
// Get one order with customer, items, payment and reviews.
// ======================================================

const getWorkerOrderDetails = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const [orders] = await db.query(
      `SELECT
          co.id,
          co.order_number,
          co.customer_id,
          cp.full_name AS customer_name,
          cp.phone AS customer_phone,
          co.delivery_location,
          co.payment_method,
          co.subtotal,
          co.delivery_fee,
          co.grand_total,
          co.order_status,
          co.created_at,
          co.updated_at,
          pay.id AS payment_id,
          pay.payment_method AS recorded_payment_method,
          pay.amount AS payment_amount,
          pay.payment_status,
          pay.transaction_reference,
          pay.rejection_reason AS payment_rejection_reason,
          pay.reviewed_by,
          pay.reviewed_at,
          CASE
            WHEN pay.receipt_path IS NOT NULL
                 AND pay.receipt_path != ''
            THEN 1
            ELSE 0
          END AS has_receipt
       FROM customer_orders co
       LEFT JOIN customer_profiles cp
          ON cp.id = co.customer_id
       LEFT JOIN customer_payments pay
          ON pay.order_id = co.id
       WHERE co.id = ?
       LIMIT 1`,
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const order = orders[0];

    const [items] = await db.query(
      `SELECT
          id,
          order_id,
          product_id,
          product_name,
          product_image,
          unit_price,
          quantity,
          line_total
       FROM customer_order_items
       WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId]
    );

    const [reviews] = await db.query(
      `SELECT
          r.id,
          r.action,
          r.reason,
          r.worker_id,
          CONCAT(u.first_name, ' ', u.last_name) AS handled_by,
          r.created_at
       FROM customer_order_reviews r
       LEFT JOIN users u
          ON u.id = r.worker_id
       WHERE r.order_id = ?
       ORDER BY r.created_at DESC, r.id DESC`,
      [orderId]
    );

    return res.status(200).json({
      success: true,
      order: {
        ...order,
        items,
        reviews,
      },
    });
  } catch (error) {
    console.error("Get worker order details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load order details.",
    });
  }
};

// ======================================================
// GET /api/worker-orders/:orderId/receipt
//
// Securely display a customer's payment receipt.
// ======================================================

const getWorkerOrderReceipt = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const [payments] = await db.query(
      `SELECT receipt_path
       FROM customer_payments
       WHERE order_id = ?
         AND receipt_path IS NOT NULL
         AND receipt_path != ''
       ORDER BY id DESC
       LIMIT 1`,
      [orderId]
    );

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payment receipt was uploaded for this order.",
      });
    }

    const receiptPath = payments[0].receipt_path;

    const verifiedFilePath =
      await getVerifiedPrivateReceiptFile(receiptPath);

    if (!verifiedFilePath) {
      return res.status(404).json({
        success: false,
        message: "The payment receipt file was not found.",
      });
    }

    const extension = path.extname(verifiedFilePath).toLowerCase();

    const allowedMimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".bmp": "image/bmp",
      ".avif": "image/avif",
    };

    const mimeType = allowedMimeTypes[extension];

    if (!mimeType) {
      return res.status(415).json({
        success: false,
        message: "Unsupported receipt image format.",
      });
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.sendFile(
      verifiedFilePath,
      {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
      (error) => {
        if (error && !res.headersSent) {
          console.error("Send worker receipt error:", error);

          res.status(500).json({
            success: false,
            message: "Failed to display payment receipt.",
          });
        }
      }
    );
  } catch (error) {
    console.error("Get worker order receipt error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to load payment receipt.",
      });
    }
  }
};

// ======================================================
// POST /api/worker-orders/:orderId/approve
//
// One transaction:
// 1. Verify worker payment confirmation.
// 2. Check stock.
// 3. Deduct stock.
// 4. Confirm order.
// 5. Approve payment.
// 6. Record worker review with generated ID.
// ======================================================

const approveOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const workerId = req.user?.id;
  const userRole = String(req.user?.role || "").toLowerCase();

  if (userRole !== "worker") {
    return res.status(403).json({
      success: false,
      message: "Only workers can approve customer orders.",
    });
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  if (!workerId) {
    return res.status(401).json({
      success: false,
      message: "Worker authentication is required.",
    });
  }

  if (req.body?.paymentConfirmed !== true) {
    return res.status(400).json({
      success: false,
      message:
        "Please confirm that the payment has actually been received before approving this order.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock order.
    const [orders] = await connection.query(
      `SELECT id, order_status, payment_method
       FROM customer_orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const order = orders[0];

    if (order.order_status !== "Pending") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          `This order cannot be approved because its current status is ${order.order_status}.`,
      });
    }

    // Lock payment record.
    const [payments] = await connection.query(
      `SELECT
          id,
          payment_method,
          payment_status,
          receipt_path
       FROM customer_payments
       WHERE order_id = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [orderId]
    );

    if (payments.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "This order has no payment record.",
      });
    }

    const payment = payments[0];

    if (payment.payment_status !== "Pending") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          `This payment cannot be approved because its current status is ${payment.payment_status}.`,
      });
    }

    const paymentMethod = String(
      payment.payment_method || order.payment_method || ""
    ).trim();

    const isCashOnDelivery =
      /cash\s*on\s*delivery/i.test(paymentMethod);

    // Electronic payments must have a receipt.
    // Cash on Delivery does not require a receipt.
    if (!isCashOnDelivery && !payment.receipt_path) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "An electronic payment receipt is required before approving this order.",
      });
    }

    // Load order items.
    const [items] = await connection.query(
      `SELECT product_id, product_name, quantity
       FROM customer_order_items
       WHERE order_id = ?
       ORDER BY product_id ASC`,
      [orderId]
    );

    if (items.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "This order has no items.",
      });
    }

    // Aggregate quantities in case the same product appears
    // in more than one order-item row.
    const aggregatedItems = new Map();

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message:
            `Invalid product or quantity for "${item.product_name}".`,
        });
      }

      if (aggregatedItems.has(productId)) {
        const existing = aggregatedItems.get(productId);
        existing.quantity += quantity;
      } else {
        aggregatedItems.set(productId, {
          product_id: productId,
          product_name: item.product_name,
          quantity,
        });
      }
    }

    const productItems = Array.from(aggregatedItems.values());

    const productIds = productItems.map(
      (item) => item.product_id
    );

    const placeholders = productIds.map(() => "?").join(",");

    // Lock product rows in ascending order.
    const [products] = await connection.query(
      `SELECT id, name, quantity, quantity_sold, status
       FROM products
       WHERE id IN (${placeholders})
       ORDER BY id ASC
       FOR UPDATE`,
      productIds
    );

    const productMap = new Map(
      products.map((product) => [
        Number(product.id),
        product,
      ])
    );

    // Check all products before changing any stock.
    for (const item of productItems) {
      const product = productMap.get(item.product_id);

      if (!product || product.status !== "Active") {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message:
            `The product "${item.product_name}" is not available.`,
        });
      }

      if (Number(product.quantity) < item.quantity) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            `Insufficient stock for "${item.product_name}". ` +
            `Available: ${product.quantity}, requested: ${item.quantity}.`,
        });
      }
    }

    // Deduct stock only after every product passes validation.
    for (const item of productItems) {
      const [updateResult] = await connection.query(
        `UPDATE products
         SET
           quantity = quantity - ?,
           quantity_sold = COALESCE(quantity_sold, 0) + ?
         WHERE id = ?
           AND quantity >= ?`,
        [
          item.quantity,
          item.quantity,
          item.product_id,
          item.quantity,
        ]
      );

      if (updateResult.affectedRows !== 1) {
        throw new Error(
          `Stock update failed for product ID ${item.product_id}.`
        );
      }
    }

    // Confirm order.
    await connection.query(
      `UPDATE customer_orders
       SET order_status = 'Confirmed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [orderId]
    );

    // Approve payment and record who verified it.
    const [paymentUpdate] = await connection.query(
      `UPDATE customer_payments
       SET payment_status = 'Approved',
           reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND payment_status = 'Pending'`,
      [workerId, payment.id]
    );

    if (paymentUpdate.affectedRows !== 1) {
      throw new Error("Payment approval could not be saved.");
    }

    // Generate review ID and record worker approval.
    const reviewId =
      await generateCustomerOrderReviewId(connection);

    await connection.query(
      `INSERT INTO customer_order_reviews
         (id, order_id, worker_id, action, reason, created_at)
       VALUES (?, ?, ?, 'Approved', NULL, CURRENT_TIMESTAMP)`,
      [reviewId, orderId, workerId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Payment approved and order confirmed successfully. Product stock has been updated.",
      orderId,
      orderStatus: "Confirmed",
      paymentStatus: "Approved",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Approval rollback error:", rollbackError);
      }
    }

    console.error("Approve order error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Failed to approve the order. No stock or payment changes were saved.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// POST /api/worker-orders/:orderId/reject
// Reject a pending order without changing stock.
// ======================================================

const rejectOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const workerId = req.user?.id;
  const userRole = String(req.user?.role || "").toLowerCase();

  const reason =
    typeof req.body?.reason === "string"
      ? req.body.reason.trim()
      : "";

  if (userRole !== "worker") {
    return res.status(403).json({
      success: false,
      message: "Only workers can reject customer orders.",
    });
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  if (!workerId) {
    return res.status(401).json({
      success: false,
      message: "Worker authentication is required.",
    });
  }

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: "A rejection reason is required.",
    });
  }

  if (reason.length > 500) {
    return res.status(400).json({
      success: false,
      message: "The rejection reason cannot exceed 500 characters.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.query(
      `SELECT id, order_status
       FROM customer_orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (orders[0].order_status !== "Pending") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          `This order cannot be rejected because its current status is ${orders[0].order_status}.`,
      });
    }

    await connection.query(
      `UPDATE customer_orders
       SET order_status = 'Rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [orderId]
    );

    // Generate review ID and record worker rejection.
    const reviewId =
      await generateCustomerOrderReviewId(connection);

    await connection.query(
      `INSERT INTO customer_order_reviews
         (id, order_id, worker_id, action, reason, created_at)
       VALUES (?, ?, ?, 'Rejected', ?, CURRENT_TIMESTAMP)`,
      [reviewId, orderId, workerId, reason]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Order rejected successfully. Product stock was not changed.",
      orderId,
      orderStatus: "Rejected",
      rejectionReason: reason,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rejection rollback error:", rollbackError);
      }
    }

    console.error("Reject order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject the order.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// GET /api/worker-orders/sales-history
// Get confirmed and rejected orders.
// ======================================================

const getWorkerSalesHistory = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT
          co.id,
          co.order_number,
          co.customer_id,
          cp.full_name AS customer_name,
          cp.phone AS customer_phone,
          co.delivery_location,
          co.payment_method,
          co.subtotal,
          co.delivery_fee,
          co.grand_total,
          co.order_status,
          co.created_at,
          co.updated_at,
          pay.payment_status,
          pay.transaction_reference,
          CASE
            WHEN pay.receipt_path IS NOT NULL
                 AND pay.receipt_path != ''
            THEN 1
            ELSE 0
          END AS has_receipt,
          (
            SELECT COUNT(*)
            FROM customer_order_items coi
            WHERE coi.order_id = co.id
          ) AS total_items,
          (
            SELECT r.reason
            FROM customer_order_reviews r
            WHERE r.order_id = co.id
              AND r.action = 'Rejected'
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
          ) AS rejection_reason
       FROM customer_orders co
       LEFT JOIN customer_profiles cp
          ON cp.id = co.customer_id
       LEFT JOIN customer_payments pay
          ON pay.order_id = co.id
       WHERE co.order_status IN (
          'Confirmed',
          'Preparing',
          'Ready',
          'Out for Delivery',
          'Delivered',
          'Rejected'
       )
       ORDER BY co.updated_at DESC, co.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get worker sales history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load sales history.",
    });
  }
};

// ======================================================
// DELETE /api/worker-orders/:orderId/rejected
// Workers can permanently delete Rejected orders only.
// ======================================================

const deleteRejectedOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const userRole = String(req.user?.role || "").toLowerCase();

  if (userRole !== "worker") {
    return res.status(403).json({
      success: false,
      message: "Only workers can delete rejected orders.",
    });
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  let connection;
  let receiptPaths = [];
  let customerId = null;
  let orderNumber = null;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.query(
      `SELECT id, order_number, customer_id, order_status
       FROM customer_orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Order not found. It may already have been deleted.",
      });
    }

    const order = orders[0];

    if (order.order_status !== "Rejected") {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message: "Workers can delete rejected orders only.",
      });
    }

    customerId = order.customer_id;
    orderNumber = order.order_number;

    // Save all receipt paths before deleting payment records.
    const [payments] = await connection.query(
      `SELECT receipt_path
       FROM customer_payments
       WHERE order_id = ?
       FOR UPDATE`,
      [orderId]
    );

    receiptPaths = payments
      .map((payment) => payment.receipt_path)
      .filter(Boolean);

    // Delete payment first because its FK uses ON DELETE RESTRICT.
    await connection.query(
      `DELETE FROM customer_payments
       WHERE order_id = ?`,
      [orderId]
    );

    // Delete the order. Items and reviews use ON DELETE CASCADE.
    const [deleteResult] = await connection.query(
      `DELETE FROM customer_orders
       WHERE id = ?
         AND order_status = 'Rejected'`,
      [orderId]
    );

    if (deleteResult.affectedRows !== 1) {
      throw new Error("Rejected order could not be deleted.");
    }

    // Delete customer profile only if no other orders use it.
    if (customerId) {
      await connection.query(
        `DELETE FROM customer_profiles
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM customer_orders
             WHERE customer_orders.customer_id = ?
           )`,
        [customerId, customerId]
      );
    }

    await connection.commit();

    // Delete receipt files only after DB commit succeeds.
    for (const receiptPath of receiptPaths) {
      await deletePrivateReceiptFile(receiptPath);
    }

    return res.status(200).json({
      success: true,
      message:
        "Rejected order and its related records deleted successfully.",
      orderId,
      orderNumber,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Delete rejected order rollback error:", rollbackError);
      }
    }

    console.error("Delete rejected order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete rejected order.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// EXPORT ALL WORKER ORDER CONTROLLER FUNCTIONS
// ======================================================

module.exports = {
  getWorkerOrders,
  getWorkerOrderDetails,
  getWorkerOrderReceipt,
  approveOrder,
  rejectOrder,
  getWorkerSalesHistory,
  deleteRejectedOrder,
};
