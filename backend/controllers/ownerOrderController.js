const db = require("../db");

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

       LEFT JOIN customer_payments pay
          ON pay.id = (
            SELECT MAX(p2.id)
            FROM customer_payments p2
            WHERE p2.order_id = co.id
          )

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
          pay.reviewed_at AS payment_reviewed_at

       FROM customer_orders co

       LEFT JOIN customer_profiles cp
          ON cp.id = co.customer_id

       LEFT JOIN customer_payments pay
          ON pay.id = (
            SELECT MAX(p2.id)
            FROM customer_payments p2
            WHERE p2.order_id = co.id
          )

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
// DELETE /api/owner-orders/:orderId
// Permanently delete any order and its related records.
// Owner only.
// ======================================================
const permanentlyDeleteOwnerOrder = async (req, res) => {
  const orderId = Number(req.params.orderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Lock the order while deleting it.
    const [orders] = await connection.query(
      `SELECT id, order_number, order_status
       FROM customer_orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Order not found. It may already have been deleted.",
      });
    }

    const order = orders[0];

    // Delete worker approval/rejection history.
    await connection.query(
      `DELETE FROM customer_order_reviews
       WHERE order_id = ?`,
      [orderId]
    );

    // Delete ordered product records.
    await connection.query(
      `DELETE FROM customer_order_items
       WHERE order_id = ?`,
      [orderId]
    );

    // Delete payment records.
    await connection.query(
      `DELETE FROM customer_payments
       WHERE order_id = ?`,
      [orderId]
    );

    // Finally delete the main order.
    const [deleteResult] = await connection.query(
      `DELETE FROM customer_orders
       WHERE id = ?`,
      [orderId]
    );

    if (deleteResult.affectedRows !== 1) {
      throw new Error("The order could not be deleted.");
    }

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Order and its related database records permanently deleted.",
      orderId: order.id,
      orderNumber: order.order_number,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
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
// EXPORT CONTROLLER FUNCTIONS
// ======================================================
module.exports = {
  getAllOwnerOrders,
  getOwnerOrderDetails,
  permanentlyDeleteOwnerOrder,
};