
const db = require("../db");
const bcrypt = require("bcryptjs");

// =============================================
// VERIFY CUSTOMER AND RETRIEVE ORDER HISTORY
// =============================================

const getCustomerOrderHistory = async (req, res) => {
  try {
    const { phone, pin } = req.body || {};

    // 1. Validate input
    const cleanPhone = String(phone || "").replace(/\s+/g, "");
    const cleanPin = String(pin || "").trim();

    if (!cleanPhone || !cleanPin) {
      return res.status(400).json({
        success: false,
        message: "Phone number and PIN are required.",
      });
    }

    // 2. Find ALL customer profiles with this phone number
    const [customers] = await db.query(
      `
      SELECT
        id,
        full_name,
        phone,
        pin_hash
      FROM customer_profiles
      WHERE REPLACE(phone, ' ', '') = ?
      ORDER BY id ASC
      `,
      [cleanPhone]
    );

    if (customers.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or PIN.",
      });
    }

    // 3. Find the profile whose PIN matches
    let matchedCustomer = null;

    for (const customer of customers) {
      if (!customer.pin_hash) {
        continue;
      }

      const validPin = await bcrypt.compare(
        cleanPin,
        customer.pin_hash
      );

      if (validPin) {
        matchedCustomer = customer;
        break;
      }
    }

    if (!matchedCustomer) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or PIN.",
      });
    }

    // 4. Retrieve orders and their latest payment.
    // TiDB-compatible approach:
    // Find the maximum payment ID per order in a derived table.
    // No correlated subquery inside the JOIN condition.

    const [orders] = await db.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.delivery_location,
        o.payment_method,
        o.subtotal,
        o.delivery_fee,
        o.grand_total,
        o.order_status,
        o.created_at,

        p.payment_status,
        p.rejection_reason AS payment_rejection_reason,
        p.transaction_reference

      FROM customer_orders o

      LEFT JOIN (
        SELECT
          cp.order_id,
          MAX(cp.id) AS latest_payment_id
        FROM customer_payments cp
        GROUP BY cp.order_id
      ) latest_payment
        ON latest_payment.order_id = o.id

      LEFT JOIN customer_payments p
        ON p.id = latest_payment.latest_payment_id

      WHERE o.customer_id = ?

      ORDER BY o.created_at DESC, o.id DESC
      `,
      [matchedCustomer.id]
    );

    // 5. Retrieve products for all orders
    const orderIds = orders.map((order) => order.id);

    let items = [];

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => "?").join(",");

      const [orderItems] = await db.query(
        `
        SELECT
          id,
          order_id,
          product_id,
          product_name,
          product_image,
          unit_price,
          quantity,
          line_total
        FROM customer_order_items
        WHERE order_id IN (${placeholders})
        ORDER BY id ASC
        `,
        orderIds
      );

      items = orderItems;
    }

    // 6. Attach products to their corresponding orders
    const formattedOrders = orders.map((order) => ({
      ...order,
      items: items.filter(
        (item) => Number(item.order_id) === Number(order.id)
      ),
    }));

    // 7. Return customer and order history
    return res.status(200).json({
      success: true,

      customer: {
        id: matchedCustomer.id,
        full_name: matchedCustomer.full_name,
        phone: matchedCustomer.phone,
      },

      total_orders: formattedOrders.length,
      orders: formattedOrders,
    });

  } catch (error) {
    console.error("Customer order history error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve order history.",
    });
  }
};

// =============================================
// EXPORTS
// =============================================

module.exports = {
  getCustomerOrderHistory,
};
