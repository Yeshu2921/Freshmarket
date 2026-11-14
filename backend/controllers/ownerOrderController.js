
const db = require("../db");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

// ======================================================
// PRIVATE PAYMENT RECEIPT HELPERS
// ======================================================

const backendRoot = path.resolve(__dirname, "..");

const receiptDirectory = path.resolve(
  backendRoot,
  "private_uploads",
  "customer",
  "payment-receipts"
);

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
      filePath = path.resolve(receiptDirectory, relativePath);
    } else {
      return null;
    }
  }

  const relativePath = path.relative(receiptDirectory, filePath);

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
// NORMALIZE ORDER PRODUCT IMAGES
// ======================================================

function normalizeOrderItemImages(item) {
  let productImages = [];

  try {
    if (Array.isArray(item.product_images)) {
      productImages = item.product_images;
    } else if (typeof item.product_images === "string") {
      productImages = JSON.parse(item.product_images);
    }
  } catch (error) {
    productImages = [];
  }

  if (!Array.isArray(productImages)) {
    productImages = [];
  }

  productImages = [
    ...new Set(
      productImages.filter(
        (image) =>
          typeof image === "string" && image.trim() !== ""
      )
    ),
  ];

  if (productImages.length === 0 && item.product_image) {
    productImages = [item.product_image];
  }

  return {
    ...item,
    product_images: productImages,
  };
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

    const [rawItems] = await db.query(
      `SELECT
          id,
          order_id,
          product_id,
          product_name,
          product_image,
          product_images,
          unit_price,
          quantity,
          line_total
       FROM customer_order_items
       WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId]
    );

    const items = rawItems.map(normalizeOrderItemImages);

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
// Securely stream the private payment receipt.
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

    const verifiedFilePath =
      await getVerifiedPrivateReceiptFile(
        payments[0].receipt_path
      );

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
          console.error("Send owner receipt error:", error);

          res.status(500).json({
            success: false,
            message: "Failed to send the payment receipt.",
          });
        }
      }
    );
  } catch (error) {
    console.error("Get owner payment receipt error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to load the payment receipt.",
      });
    }
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
// Related records are explicitly deleted in this function.
// No product or product_images lookup is required.
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

    // 1. Lock and find the order.
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

    // 2. Lock payment records.
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

    // 3. Confirm worker approval review exists.
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

    // 4. Save receipt paths before deleting payment records.
    receiptPaths = payments
      .map((payment) => payment.receipt_path)
      .filter(Boolean);

    // 5. Delete payment records.
    await connection.query(
      `DELETE FROM customer_payments
       WHERE order_id = ?`,
      [orderId]
    );

    // 6. Delete review history.
    await connection.query(
      `DELETE FROM customer_order_reviews
       WHERE order_id = ?`,
      [orderId]
    );

    // 7. Delete order items.
    // This does not access products or product_images.
    await connection.query(
      `DELETE FROM customer_order_items
       WHERE order_id = ?`,
      [orderId]
    );

    // 8. Delete the order itself.
    const [deleteResult] = await connection.query(
      `DELETE FROM customer_orders
       WHERE id = ?
         AND order_status = 'Confirmed'`,
      [orderId]
    );

    if (deleteResult.affectedRows !== 1) {
      throw new Error("The confirmed order could not be deleted.");
    }

    // 9. Preserve the existing cleanup behavior:
    // Delete the customer profile only when no other orders
    // reference it. Do not delete a profile still in use.
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

    // 10. Commit database changes.
    await connection.commit();

    // 11. Delete receipt files only after successful commit.
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
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// ======================================================
// PATCH /api/owner-orders/:orderId/reset-pin
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

  if (
    typeof newPin !== "string" ||
    !/^\d{4,6}$/.test(newPin)
  ) {
    return res.status(400).json({
      success: false,
      message: "PIN must contain 4 to 6 digits.",
    });
  }

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
