
const db = require("../db");

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

async function queryRows(sql, params = []) {
  const result = await db.query(sql, params);

  return Array.isArray(result) && Array.isArray(result[0])
    ? result[0]
    : result;
}

function handleError(res, error, message) {
  console.error("Owner Reports Error:", error);

  return res.status(500).json({
    success: false,
    message,
  });
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// Default report period: last 30 days.
function getDateRange(req, res) {
  const today = new Date().toISOString().slice(0, 10);

  const defaultStart = new Date();
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);

  const startDate =
    req.query.startDate || defaultStart.toISOString().slice(0, 10);

  const endDate = req.query.endDate || today;

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    res.status(400).json({
      success: false,
      message: "Invalid date. Use YYYY-MM-DD format.",
    });

    return null;
  }

  if (startDate > endDate) {
    res.status(400).json({
      success: false,
      message: "Start date cannot be after end date.",
    });

    return null;
  }

  return { startDate, endDate };
}

// --------------------------------------------------
// APPROVED SALES RULE
//
// Only the latest payment record is checked.
// Payment must be Approved.
// Order must not be Pending, Rejected, or Cancelled.
//
// TiDB compatibility:
// Use a derived table instead of a subquery inside
// the JOIN ON condition.
// --------------------------------------------------

const APPROVED_SALES_JOIN = `
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
    AND p.payment_status = 'Approved'
`;

const APPROVED_SALES_CONDITION = `
  AND o.order_status NOT IN (
    'Pending',
    'Rejected',
    'Cancelled'
  )
`;

// --------------------------------------------------
// 1. REPORT SUMMARY
// GET /api/owner-reports/summary
// --------------------------------------------------

const getReportSummary = async (req, res) => {
  try {
    const salesSql = `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN DATE(o.created_at) = CURDATE()
              THEN o.grand_total
              ELSE 0
            END
          ), 0
        ) AS today_sales,

        COALESCE(
          SUM(
            CASE
              WHEN YEAR(o.created_at) = YEAR(CURDATE())
              AND MONTH(o.created_at) = MONTH(CURDATE())
              THEN o.grand_total
              ELSE 0
            END
          ), 0
        ) AS monthly_sales

      FROM customer_orders o

      ${APPROVED_SALES_JOIN}

      WHERE 1 = 1
      ${APPROVED_SALES_CONDITION}
    `;

    const salesRows = await queryRows(salesSql);

    // Completed orders use approved payment + valid order status.
    // Pending and rejected counts are independent of payment.
    const countSql = `
      SELECT
        (
          SELECT COUNT(*)
          FROM customer_orders o

          ${APPROVED_SALES_JOIN}

          WHERE 1 = 1
          ${APPROVED_SALES_CONDITION}
        ) AS completed_orders,

        COALESCE(
          SUM(
            CASE
              WHEN order_status = 'Rejected'
              THEN 1 ELSE 0
            END
          ), 0
        ) AS rejected_orders,

        COALESCE(
          SUM(
            CASE
              WHEN order_status = 'Pending'
              THEN 1 ELSE 0
            END
          ), 0
        ) AS pending_orders

      FROM customer_orders
    `;

    const countRows = await queryRows(countSql);

    return res.json({
      success: true,
      summary: {
        ...salesRows[0],
        ...countRows[0],
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to load report summary."
    );
  }
};

// --------------------------------------------------
// 2. DAILY, WEEKLY AND MONTHLY SALES
// GET /api/owner-reports/sales
//
// period=daily | weekly | monthly
// --------------------------------------------------

const getSalesReport = async (req, res) => {
  try {
    const range = getDateRange(req, res);

    if (!range) return;

    const period = String(
      req.query.period || "daily"
    ).toLowerCase();

    const groupFormats = {
      daily: "DATE(o.created_at)",

      weekly: `
        DATE_SUB(
          DATE(o.created_at),
          INTERVAL WEEKDAY(o.created_at) DAY
        )
      `,

      monthly: "DATE_FORMAT(o.created_at, '%Y-%m')",
    };

    if (!groupFormats[period]) {
      return res.status(400).json({
        success: false,
        message: "Period must be daily, weekly, or monthly.",
      });
    }

    const groupBy = groupFormats[period];

    const sql = `
      SELECT
        ${groupBy} AS period,

        COALESCE(SUM(o.grand_total), 0) AS total_sales,

        COUNT(DISTINCT o.id) AS total_orders

      FROM customer_orders o

      ${APPROVED_SALES_JOIN}

      WHERE o.created_at >= ?
      AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)

      ${APPROVED_SALES_CONDITION}

      GROUP BY period

      ORDER BY period ASC
    `;

    const rows = await queryRows(sql, [
      range.startDate,
      range.endDate,
    ]);

    const totals = rows.reduce(
      (result, row) => ({
        totalSales:
          result.totalSales + Number(row.total_sales || 0),

        totalOrders:
          result.totalOrders + Number(row.total_orders || 0),
      }),
      {
        totalSales: 0,
        totalOrders: 0,
      }
    );

    return res.json({
      success: true,
      period,
      dateRange: range,
      totals,
      sales: rows,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to generate sales report."
    );
  }
};

// --------------------------------------------------
// 3. BEST-SELLING PRODUCTS
// GET /api/owner-reports/best-selling
// --------------------------------------------------

const getBestSellingProducts = async (req, res) => {
  try {
    const range = getDateRange(req, res);

    if (!range) return;

    const requestedLimit = Number(req.query.limit || 10);

    if (
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 50.",
      });
    }

    const sql = `
      SELECT
        oi.product_id,
        oi.product_name,

        SUM(oi.quantity) AS units_sold,

        COALESCE(
          SUM(oi.line_total), 0
        ) AS total_revenue

      FROM customer_order_items oi

      INNER JOIN customer_orders o
        ON o.id = oi.order_id

      ${APPROVED_SALES_JOIN}

      WHERE o.created_at >= ?
      AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)

      ${APPROVED_SALES_CONDITION}

      GROUP BY
        oi.product_id,
        oi.product_name

      ORDER BY units_sold DESC

      LIMIT ?
    `;

    const rows = await queryRows(sql, [
      range.startDate,
      range.endDate,
      requestedLimit,
    ]);

    return res.json({
      success: true,
      dateRange: range,
      count: rows.length,
      products: rows,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to load best-selling products."
    );
  }
};

// --------------------------------------------------
// 4. LOW-STOCK PRODUCTS
// GET /api/owner-reports/low-stock
// --------------------------------------------------

const getLowStockProducts = async (req, res) => {
  try {
    const threshold = Number(req.query.threshold ?? 10);

    if (
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > 1000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Stock threshold must be a valid non-negative number.",
      });
    }

    const sql = `
      SELECT
        p.id,
        p.name,
        p.sku,
        p.barcode,
        p.quantity,
        p.quantity_sold,
        p.unit,
        p.selling_price,
        p.status,
        c.category_name

      FROM products p

      LEFT JOIN categories c
        ON c.id = p.category_id

      WHERE p.status = 'Active'
      AND p.quantity <= ?

      ORDER BY p.quantity ASC, p.name ASC
    `;

    const rows = await queryRows(sql, [threshold]);

    return res.json({
      success: true,
      threshold,
      count: rows.length,
      products: rows,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to load low-stock products."
    );
  }
};

// --------------------------------------------------
// 5. COMPLETED SALES AND REJECTED ORDERS
// GET /api/owner-reports/orders
//
// status=Completed | Delivered | Rejected | All
//
// Completed = latest payment Approved
//             AND order not Pending/Rejected/Cancelled.
//
// Delivered is temporarily supported as an alias
// for Completed to keep the existing frontend working.
// --------------------------------------------------

const getOrderStatusReport = async (req, res) => {
  try {
    const range = getDateRange(req, res);

    if (!range) return;

    const status = String(
      req.query.status || "All"
    );

    const allowedStatuses = [
      "All",
      "Completed",
      "Delivered",
      "Rejected",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be All, Completed, Delivered, or Rejected.",
      });
    }

    const params = [
      range.startDate,
      range.endDate,
    ];

    let statusCondition = "";
    let paymentJoin = "";

    if (status === "Completed" || status === "Delivered") {
      // Delivered is accepted as an old frontend alias.
      paymentJoin = APPROVED_SALES_JOIN;

      statusCondition = APPROVED_SALES_CONDITION;

    } else if (status === "Rejected") {
      statusCondition = `
        AND o.order_status = 'Rejected'
      `;

    } else {
      // All = approved completed sales + rejected orders.
      // Use a derived table for the latest payment.
      paymentJoin = `
        LEFT JOIN (
          SELECT
            order_id,
            MAX(id) AS latest_payment_id
          FROM customer_payments
          GROUP BY order_id
        ) latest_payment
          ON latest_payment.order_id = o.id

        LEFT JOIN customer_payments p
          ON p.id = latest_payment.latest_payment_id
      `;

      statusCondition = `
        AND (
          (
            p.payment_status = 'Approved'
            AND o.order_status NOT IN (
              'Pending',
              'Rejected',
              'Cancelled'
            )
          )
          OR o.order_status = 'Rejected'
        )
      `;
    }

    const sql = `
      SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.payment_method,
        o.subtotal,
        o.delivery_fee,
        o.grand_total,
        o.order_status,
        o.created_at,
        o.updated_at,

        (
          SELECT r.reason
          FROM customer_order_reviews r
          WHERE r.order_id = o.id
          AND r.action = 'Rejected'
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT 1
        ) AS rejection_reason

      FROM customer_orders o

      ${paymentJoin}

      WHERE o.created_at >= ?
      AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)

      ${statusCondition}

      ORDER BY o.created_at DESC
    `;

    const rows = await queryRows(sql, params);

    const completedCount = rows.filter(
      (order) =>
        order.order_status !== "Pending" &&
        order.order_status !== "Rejected" &&
        order.order_status !== "Cancelled"
    ).length;

    const rejectedCount = rows.filter(
      (order) => order.order_status === "Rejected"
    ).length;

    return res.json({
      success: true,
      dateRange: range,

      summary: {
        completedOrders: completedCount,
        rejectedOrders: rejectedCount,
      },

      count: rows.length,
      orders: rows,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to generate order report."
    );
  }
};

// --------------------------------------------------
// EXPORT CONTROLLERS
// --------------------------------------------------

module.exports = {
  getReportSummary,
  getSalesReport,
  getBestSellingProducts,
  getLowStockProducts,
  getOrderStatusReport,
};
