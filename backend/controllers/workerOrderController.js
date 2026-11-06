
const db = require("../db");

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
// Get one order with customer, items and payment details.
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
       ORDER BY r.created_at DESC`,
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
// POST /api/worker-orders/:orderId/approve
// Approve an order and update product stock in a transaction.
// ======================================================
const approveOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const workerId = req.user.id;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the order so two workers cannot approve it simultaneously.
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
        message: `This order cannot be approved because its current status is ${orders[0].order_status}.`,
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

    // Validate product IDs before updating stock.
    for (const item of items) {
      if (!item.product_id) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: `The product "${item.product_name}" is no longer available.`,
        });
      }
    }

    // Lock all related product rows in ascending product ID order.
    const productIds = [
      ...new Set(items.map((item) => item.product_id)),
    ];

    const placeholders = productIds.map(() => "?").join(",");

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

    // Check stock for every item before changing any stock.
    for (const item of items) {
      const product = productMap.get(Number(item.product_id));

      if (!product || product.status !== "Active") {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: `The product "${item.product_name}" is not available.`,
        });
      }

      if (Number(product.quantity) < Number(item.quantity)) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            `Insufficient stock for "${item.product_name}". ` +
            `Available: ${product.quantity}, requested: ${item.quantity}.`,
        });
      }
    }

    // Deduct stock and increase quantity_sold after all checks pass.
    for (const item of items) {
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

    // Change order status only after stock updates succeed.
    await connection.query(
      `UPDATE customer_orders
       SET order_status = 'Confirmed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [orderId]
    );

    // Save who approved the order and when.
    await connection.query(
      `INSERT INTO customer_order_reviews
         (order_id, worker_id, action, reason, created_at)
       VALUES (?, ?, 'Approved', NULL, CURRENT_TIMESTAMP)`,
      [orderId, workerId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Order approved successfully. Product stock has been updated.",
      orderId,
      orderStatus: "Confirmed",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Approve order error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve the order. No stock changes were saved.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ======================================================
// POST /api/worker-orders/:orderId/reject
// Reject a pending order without changing product stock.
// ======================================================
const rejectOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);
  const workerId = req.user.id;

  const reason =
    typeof req.body.reason === "string"
      ? req.body.reason.trim()
      : "";

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
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

    // Lock the order before checking its status.
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
        message: `This order cannot be rejected because its current status is ${orders[0].order_status}.`,
      });
    }

    // Reject the order. No product stock is changed.
    await connection.query(
      `UPDATE customer_orders
       SET order_status = 'Rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [orderId]
    );

    // Save rejection reason and the worker who handled it.
    await connection.query(
      `INSERT INTO customer_order_reviews
         (order_id, worker_id, action, reason, created_at)
       VALUES (?, ?, 'Rejected', ?, CURRENT_TIMESTAMP)`,
      [orderId, workerId, reason]
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
      await connection.rollback();
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
// Get approved/confirmed and rejected orders.
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
            ORDER BY r.created_at DESC
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
          'Out for delivery',
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
// Workers can delete rejected orders only.
// Approved/completed orders are protected.
// ======================================================
const deleteRejectedOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);

  // This endpoint is specifically for worker deletion.
  const userRole = String(req.user?.role || "").toLowerCase();

  if (userRole !== "worker") {
    return res.status(403).json({
      success: false,
      message: "Only workers can use this rejected-order deletion endpoint.",
    });
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the order to prevent a concurrent status change.
    const [orders] = await connection.query(
      `SELECT id, order_number, order_status
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

    // Strictly allow deletion of Rejected orders only.
    if (orders[0].order_status !== "Rejected") {
      await connection.rollback();

      return res.status(403).json({
        success: false,
        message:
          "You can delete rejected orders only. Approved and completed orders are protected.",
      });
    }

    // Delete child records first to avoid foreign-key errors.
    await connection.query(
      `DELETE FROM customer_order_reviews
       WHERE order_id = ?`,
      [orderId]
    );

    await connection.query(
      `DELETE FROM customer_order_items
       WHERE order_id = ?`,
      [orderId]
    );

    await connection.query(
      `DELETE FROM customer_payments
       WHERE order_id = ?`,
      [orderId]
    );

    // Delete the main order.
    await connection.query(
      `DELETE FROM customer_orders
       WHERE id = ? AND order_status = 'Rejected'`,
      [orderId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Rejected order deleted successfully.",
      orderId,
      orderNumber: orders[0].order_number,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
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
// EXPORT ALL CONTROLLER FUNCTIONS
// ======================================================
module.exports = {
  getWorkerOrders,
  getWorkerOrderDetails,
  approveOrder,
  rejectOrder,
  getWorkerSalesHistory,
  deleteRejectedOrder,
};
