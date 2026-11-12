
const db = require("../db");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

// ======================================================
// PRIVATE PAYMENT RECEIPT HELPERS
//
// Allowed folder:
// backend/private_uploads/customer/payment-receipts
//
// This folder must NOT be exposed using express.static().
// ======================================================

const backendRoot = path.resolve(__dirname, "..");

const receiptDirectory = path.resolve(
  backendRoot,
  "private_uploads",
  "customer",
  "payment-receipts"
);

// Resolve a saved receipt path and reject paths outside
// the permitted receipt directory.
function getPrivateReceiptFile(receiptPath) {
  if (typeof receiptPath !== "string" || !receiptPath.trim()) {
    return null;
  }

  const savedPath = receiptPath.trim().replace(/\\/g, "/");

  let filePath;

  if (path.isAbsolute(savedPath)) {
    filePath = path.resolve(savedPath);
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
      relativePath !== "." &&
      relativePath !== ".." &&
      !relativePath.includes("/")
    ) {
      // Also support a filename stored by itself.
      filePath = path.resolve(receiptDirectory, relativePath);
    } else {
      return null;
    }
  }

  const relativePath = path.relative(receiptDirectory, filePath);

  // Reject the directory itself, parent traversal, and
  // every path outside the allowed folder.
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

// Resolve the real file path too. This prevents a symlink
// inside the receipt folder from pointing outside it.
async function getVerifiedPrivateReceiptFile(receiptPath) {
  const filePath = getPrivateReceiptFile(receiptPath);

  if (!filePath) {
    return null;
  }

  try {
    const realDirectory = await fs.promises.realpath(receiptDirectory);
    const realFilePath = await fs.promises.realpath(filePath);

    const relativePath = path.relative(
      realDirectory,
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
      console.error("Receipt file verification error:", error);
    }

    return null;
  }
}

// Delete a receipt only when it is inside the allowed folder.
async function deletePrivateReceiptFile(receiptPath) {
  const filePath = await getVerifiedPrivateReceiptFile(receiptPath);

  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Receipt file deletion warning:", error);
    }
  }
}

// ======================================================
// GET /api/owner-orders
// Get all customer orders for the owner.
// ======================================================

const getAllOwnerOrders = async (req, res) => {
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
          pay.amount AS payment_amount,
          pay.payment_method AS recorded_payment_method,

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
            SELECT r.action
            FROM customer_order_reviews r
            WHERE r.order_id = co.id
              AND r.action = 'Approved'
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
          ) AS approved_review_action,

          CASE
            WHEN EXISTS (
              SELECT 1
              FROM customer_order_reviews r
              WHERE r.order_id = co.id
                AND r.action = 'Approved'
            )
            THEN 1
            ELSE 0
          END AS has_approved_review,

          (
            SELECT r.action
            FROM customer_order_reviews r
            WHERE r.order_id = co.id
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
          ) AS last_review_action,

          (
            SELECT CONCAT(u.first_name, ' ', u.last_name)
            FROM customer_order_reviews r
            LEFT JOIN users u ON u.id = r.worker_id
            WHERE r.order_id = co.id
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
          ) AS last_handled_by,

          (
            SELECT r.reason
            FROM customer_order_reviews r
            WHERE r.order_id = co.id
              AND r.action = 'Rejected'
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
          ) AS rejection_reason,

          (
            SELECT r.created_at
            FROM customer_order_reviews r
            WHERE r.order_id = co.id
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
          ) AS last_review_at

       FROM customer_orders co

       LEFT JOIN customer_profiles cp
          ON cp.id = co.customer_id

       LEFT JOIN (
          SELECT
            order_id,
            MAX(id) AS latest_payment_id
          FROM customer_payments
          GROUP BY order_id
       ) latest_payment
          ON latest_payment.order_id = co.id

       LEFT JOIN customer_payments pay
          ON pay.id = latest_payment.latest_payment_id

       ORDER BY co.created_at DESC, co.id DESC`
    );

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get all owner orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load customer orders.",
    });
  }
};

// ======================================================
// GET /api/owner-orders/:orderId
// Get complete details of one order.
// ======================================================

const getOwnerOrderDetails = async (req, res) => {
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
          pay.receipt_path,
          pay.rejection_reason AS payment_rejection_reason,
          pay.reviewed_by AS payment_reviewed_by,
          pay.reviewed_at AS payment_reviewed_at,

          CONCAT(
            reviewer.first_name,
            ' ',
            reviewer.last_name
          ) AS reviewed_by_name

       FROM customer_orders co

       LEFT JOIN customer_profiles cp
          ON cp.id = co.customer_id

       LEFT JOIN (
          SELECT
            order_id,
            MAX(id) AS latest_payment_id
          FROM customer_payments
          GROUP BY order_id
       ) latest_payment
          ON latest_payment.order_id = co.id

       LEFT JOIN customer_payments pay
          ON pay.id = latest_payment.latest_payment_id

       LEFT JOIN users reviewer
          ON reviewer.id = pay.reviewed_by

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
    console.error("Get owner order details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load order details.",
    });
  }
};

// ======================================================
// GET /api/owner-orders/:orderId/receipt
//
// Securely stream the private payment receipt.
// The route must be protected by requireAuth and
// requireOwner in ownerOrderRoutes.js.
// ======================================================

const getOwnerOrderReceipt = async (req, res) => {
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
       ORDER BY id DESC
       LIMIT 1`,
      [orderId]
    );

    if (
      payments.length === 0 ||
      !payments[0].receipt_path
    ) {
      return res.status(404).json({
        success: false,
        message: "No payment receipt was found for this order.",
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

    // Only allow image receipt types.
    const extension = path.extname(verifiedFilePath).toLowerCase();

    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".bmp",
      ".avif",
    ];

    if (!allowedExtensions.includes(extension)) {
      return res.status(415).json({
        success: false,
        message: "Unsupported receipt image format.",
      });
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.sendFile(verifiedFilePath, (error) => {
      if (error) {
        console.error("Send owner receipt error:", error);

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Failed to send the payment receipt.",
          });
        }
      }
    });
  } catch (error) {
    console.error("Get owner payment receipt error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load the payment receipt.",
    });
  }
};

// ======================================================
// DELETE /api/owner-orders/:orderId
//
// Owner can permanently delete only an order that:
// 1. Has order_status = Confirmed.
// 2. Has an Approved worker review.
// 3. Has payment_status = Approved.
//
// Related order items and reviews are deleted through
// their ON DELETE CASCADE foreign keys.
// ======================================================

const permanentlyDeleteOwnerOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const userRole = String(req.user?.role || "").toLowerCase();

  if (userRole !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Only the owner can delete confirmed orders.",
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

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the order while checking and deleting it.
    const [orders] = await connection.query(
      `SELECT
          id,
          order_number,
          customer_id,
          order_status
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

    if (order.order_status !== "Confirmed") {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message:
          "The owner can permanently delete Confirmed orders only. Pending, rejected, preparing, ready, out for delivery, delivered, and cancelled orders are protected.",
      });
    }

    // Lock all payment rows for this order.
    const [payments] = await connection.query(
      `SELECT
          id,
          payment_status,
          receipt_path
       FROM customer_payments
       WHERE order_id = ?
       ORDER BY id DESC
       FOR UPDATE`,
      [orderId]
    );

    if (
      payments.length === 0 ||
      payments[0].payment_status !== "Approved"
    ) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message:
          "This order cannot be deleted because its latest payment has not been approved.",
      });
    }

    // Confirm that a worker approval review exists.
    const [reviews] = await connection.query(
      `SELECT id
       FROM customer_order_reviews
       WHERE order_id = ?
         AND action = 'Approved'
       LIMIT 1`,
      [orderId]
    );

    if (reviews.length === 0) {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message:
          "This order cannot be deleted because no worker approval record was found.",
      });
    }

    receiptPaths = payments
      .map((payment) => payment.receipt_path)
      .filter(Boolean);

    // Delete payments first because their FK uses
    // ON DELETE RESTRICT.
    await connection.query(
      `DELETE FROM customer_payments
       WHERE order_id = ?`,
      [orderId]
    );

    // Delete the order. Its items and reviews are removed
    // automatically by ON DELETE CASCADE.
    const [deleteResult] = await connection.query(
      `DELETE FROM customer_orders
       WHERE id = ?
         AND order_status = 'Confirmed'`,
      [orderId]
    );

    if (deleteResult.affectedRows !== 1) {
      throw new Error("The confirmed order could not be deleted.");
    }

    // Delete customer profile only if there are no other orders.
    if (order.customer_id) {
      await connection.query(
        `DELETE FROM customer_profiles
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM customer_orders
             WHERE customer_orders.customer_id = ?
           )`,
        [order.customer_id, order.customer_id]
      );
    }

    await connection.commit();

    // Remove private receipt files only after successful commit.
    for (const receiptPath of receiptPaths) {
      await deletePrivateReceiptFile(receiptPath);
    }

    return res.status(200).json({
      success: true,
      message:
        "Confirmed order and its related records permanently deleted.",
      orderId: order.id,
      orderNumber: order.order_number,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Owner deletion rollback error:",
          rollbackError
        );
      }
    }

    console.error("Permanently delete owner order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to permanently delete the order.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// PATCH /api/owner-orders/:orderId/reset-pin
//
// Owner resets the PIN of the customer profile
// associated with the selected order.
// ======================================================

const resetCustomerPin = async (req, res) => {
  const orderId = Number(req.params.orderId);

  const { newPin, confirmPin } = req.body;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  // Validate new PIN.
  if (
    typeof newPin !== "string" ||
    !/^\d{4,6}$/.test(newPin)
  ) {
    return res.status(400).json({
      success: false,
      message: "PIN must contain 4 to 6 digits.",
    });
  }

  // Validate confirmation.
  if (
    typeof confirmPin !== "string" ||
    newPin !== confirmPin
  ) {
    return res.status(400).json({
      success: false,
      message: "New PIN and confirmation PIN do not match.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();

    // Find the customer profile associated with this order.
    const [orders] = await connection.query(
      `SELECT customer_id
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

    const customerId = orders[0].customer_id;

    if (!customerId) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Customer profile not found.",
      });
    }

    // Hash the PIN before saving it.
    const hashedPin = await bcrypt.hash(newPin, 12);

    const [updateResult] = await connection.query(
      `UPDATE customer_profiles
       SET pin_hash = ?
       WHERE id = ?`,
      [hashedPin, customerId]
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Unable to update customer PIN.",
      });
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Customer PIN has been reset successfully.",
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("PIN reset rollback error:", rollbackError);
      }
    }

    console.error("Reset customer PIN error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reset customer PIN.",
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// EXPORT CONTROLLER FUNCTIONS
// ======================================================

module.exports = {
  getAllOwnerOrders,
  getOwnerOrderDetails,
  getOwnerOrderReceipt,
  permanentlyDeleteOwnerOrder,
  resetCustomerPin,
};
