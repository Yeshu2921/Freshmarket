
const db = require("../db");

// Get rows from MySQL
async function queryRows(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

// Handle errors
function handleError(res, error, message) {
  console.error("Owner dashboard error:", error);

  return res.status(500).json({
    success: false,
    message,
  });
}

// GET /api/owner-dashboard
async function getOwnerDashboard(req, res) {
  try {
    // 1. Dashboard summary cards
    const summaryRows = await queryRows(`
      SELECT
        (
          SELECT COUNT(*)
          FROM products
          WHERE status = 'Active'
        ) AS totalProducts,

        (
          SELECT COALESCE(SUM(o.grand_total), 0)
          FROM customer_orders o

          INNER JOIN (
            SELECT
              order_id,
              MAX(id) AS latest_payment_id
            FROM customer_payments
            GROUP BY order_id
          ) latest_payment
            ON latest_payment.order_id = o.id

          INNER JOIN customer_payments p
            ON p.id = latest_payment.latest_payment_id

          WHERE p.payment_status = 'Approved'
            AND o.order_status NOT IN ('Cancelled', 'Rejected')
            AND COALESCE(p.reviewed_at, o.created_at)
                >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            AND COALESCE(p.reviewed_at, o.created_at) <= NOW()
        ) AS todaySales,

        (
          SELECT COUNT(*)
          FROM users
          WHERE role IN ('owner', 'worker')
        ) AS totalUsers,

        (
          SELECT COUNT(*)
          FROM products
          WHERE status = 'Active'
            AND quantity <= 10
        ) AS lowStockItems,

        (
          SELECT COALESCE(SUM(o.grand_total), 0)
          FROM customer_orders o

          INNER JOIN (
            SELECT
              order_id,
              MAX(id) AS latest_payment_id
            FROM customer_payments
            GROUP BY order_id
          ) latest_payment
            ON latest_payment.order_id = o.id

          INNER JOIN customer_payments p
            ON p.id = latest_payment.latest_payment_id

          WHERE p.payment_status = 'Approved'
            AND o.order_status NOT IN ('Cancelled', 'Rejected')
            AND COALESCE(p.reviewed_at, o.created_at)
                >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            AND COALESCE(p.reviewed_at, o.created_at)
                < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        ) AS weekSales
    `);

    const summary = summaryRows[0] || {};

    // 2. Sales trend: last 7 days, including days with zero sales.
    const dateRows = await queryRows(`
      SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today
    `);

    const today = dateRows[0].today;

    const salesRows = await queryRows(`
      SELECT
        DATE_FORMAT(
          COALESCE(p.reviewed_at, o.created_at),
          '%Y-%m-%d'
        ) AS sales_date,

        COALESCE(SUM(o.grand_total), 0) AS sales

      FROM customer_orders o

      INNER JOIN (
        SELECT
          order_id,
          MAX(id) AS latest_payment_id
        FROM customer_payments
        GROUP BY order_id
      ) latest_payment
        ON latest_payment.order_id = o.id

      INNER JOIN customer_payments p
        ON p.id = latest_payment.latest_payment_id

      WHERE p.payment_status = 'Approved'
        AND o.order_status NOT IN ('Cancelled', 'Rejected')

        AND COALESCE(p.reviewed_at, o.created_at)
            >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)

        AND COALESCE(p.reviewed_at, o.created_at)
            < DATE_ADD(CURDATE(), INTERVAL 1 DAY)

      GROUP BY DATE(
        COALESCE(p.reviewed_at, o.created_at)
      )

      ORDER BY sales_date ASC
    `);

    const salesMap = new Map(
      salesRows.map((row) => [
        row.sales_date,
        Number(row.sales),
      ])
    );

    const salesTrend = [];

    const currentDate = new Date(`${today}T00:00:00Z`);

    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      const date = new Date(currentDate);
      date.setUTCDate(date.getUTCDate() - daysAgo);

      const dateKey = date.toISOString().slice(0, 10);

      salesTrend.push({
        date: date.toLocaleDateString("en-ET", {
          day: "2-digit",
          month: "short",
          timeZone: "UTC",
        }),
        sales: salesMap.get(dateKey) || 0,
      });
    }

    // 3. Order status distribution
    const orderStatus = await queryRows(`
      SELECT
        order_status AS status,
        COUNT(*) AS count
      FROM customer_orders
      GROUP BY order_status
      ORDER BY count DESC
    `);

    // 4. Latest 8 customer orders
    const recentOrders = await queryRows(`
      SELECT
        id,
        order_number,
        created_at,
        grand_total,
        order_status
      FROM customer_orders
      ORDER BY created_at DESC, id DESC
      LIMIT 8
    `);

    // 5. Low-stock products
    const lowStockProducts = await queryRows(`
      SELECT
        p.id,
        p.name,
        p.quantity,
        c.category_name AS category_name
      FROM products p
      LEFT JOIN categories c
        ON c.id = p.category_id
      WHERE p.status = 'Active'
        AND p.quantity <= 10
      ORDER BY p.quantity ASC, p.name ASC
      LIMIT 10
    `);

    // 6. Send dashboard response
    return res.status(200).json({
      success: true,

      dashboard: {
        summary: {
          totalProducts: Number(summary.totalProducts || 0),
          todaySales: Number(summary.todaySales || 0),
          totalUsers: Number(summary.totalUsers || 0),
          lowStockItems: Number(summary.lowStockItems || 0),
          weekSales: Number(summary.weekSales || 0),
        },

        salesTrend,

        orderStatus: orderStatus.map((item) => ({
          status: item.status,
          count: Number(item.count || 0),
        })),

        recentOrders,

        lowStockProducts: lowStockProducts.map((product) => ({
          ...product,
          quantity: Number(product.quantity || 0),
        })),
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to load owner dashboard information."
    );
  }
}

module.exports = {
  getOwnerDashboard,
};
