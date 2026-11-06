
const db = require("../db");

// Get rows from MySQL
async function queryRows(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

// Handle errors
function handleError(res, error, message) {
  console.error("Worker dashboard error:", error);

  return res.status(500).json({
    success: false,
    message,
  });
}

// GET /api/worker-dashboard
const getWorkerDashboard = async (req, res) => {
  try {
    // Get logged-in worker ID
    const workerId = Number(req.user?.id);
    const userRole = String(req.user?.role || "").toLowerCase();

    if (!Number.isInteger(workerId) || workerId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid worker account.",
      });
    }

    // Worker dashboard is only accessible to workers.
    if (userRole !== "worker") {
      return res.status(403).json({
        success: false,
        message: "Only workers can access this dashboard.",
      });
    }

    // 1. Dashboard summary
    const summaryRows = await queryRows(
      `
      SELECT

        (
          SELECT COALESCE(SUM(co.grand_total), 0)
          FROM customer_order_reviews r
          INNER JOIN customer_orders co
            ON co.id = r.order_id
          WHERE r.worker_id = ?
            AND r.action = 'Approved'
            AND DATE(r.created_at) = CURDATE()
        ) AS todaySales,

        (
          SELECT COUNT(DISTINCT r.order_id)
          FROM customer_order_reviews r
          WHERE r.worker_id = ?
            AND r.action = 'Approved'
            AND DATE(r.created_at) = CURDATE()
        ) AS transactions,

        (
          SELECT COUNT(*)
          FROM products
          WHERE status = 'Active'
        ) AS availableProducts,

        (
          SELECT COUNT(*)
          FROM customer_orders
          WHERE order_status = 'Pending'
        ) AS pendingOrders
      `,
      [workerId, workerId]
    );

    const summary = summaryRows[0] || {};

    // 2. Recent activity belonging to this worker
    const recentActivity = await queryRows(
      `
      SELECT
        r.id,
        r.order_id,
        co.order_number,
        r.action,
        r.reason,
        co.grand_total,
        co.order_status,
        cp.full_name AS customer_name,
        r.created_at

      FROM customer_order_reviews r

      INNER JOIN customer_orders co
        ON co.id = r.order_id

      LEFT JOIN customer_profiles cp
        ON cp.id = co.customer_id

      WHERE r.worker_id = ?

      ORDER BY r.created_at DESC, r.id DESC

      LIMIT 10
      `,
      [workerId]
    );

    // 3. Send dashboard response
    return res.status(200).json({
      success: true,

      dashboard: {
        summary: {
          todaySales: Number(summary.todaySales || 0),
          transactions: Number(summary.transactions || 0),
          availableProducts: Number(summary.availableProducts || 0),
          pendingOrders: Number(summary.pendingOrders || 0),
        },

        recentActivity: recentActivity.map((activity) => ({
          ...activity,
          grand_total: Number(activity.grand_total || 0),
        })),
      },
    });

  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to load worker dashboard information."
    );
  }
};

module.exports = {
  getWorkerDashboard,
};
