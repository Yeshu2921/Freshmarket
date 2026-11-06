const db = require("../db");
const bcrypt = require("bcryptjs");

// Verify customer and retrieve their order history
const getCustomerOrderHistory = async (req, res) => {
  try {
    const { phone, pin } = req.body;

    // 1. Validate input
    const cleanPhone = String(phone || "").trim();
    const cleanPin = String(pin || "").trim();

    if (!cleanPhone || !cleanPin) {
      return res.status(400).json({
        success: false,
        message: "Phone number and PIN are required.",
      });
    }

    // 2. Find customer by phone
    const [customers] = await db.query(
      `SELECT id, full_name, phone, pin_hash
       FROM customer_profiles
       WHERE phone = ?
       LIMIT 1`,
      [cleanPhone]
    );

    if (customers.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or PIN.",
      });
    }

    const customer = customers[0];

    // 3. Verify PIN
    const validPin = await bcrypt.compare(
      cleanPin,
      customer.pin_hash
    );

    if (!validPin) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or PIN.",
      });
    }

    // 4. Retrieve only this customer's orders
    const [orders] = await db.query(
      `SELECT
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
       LEFT JOIN customer_payments p
          ON p.order_id = o.id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
      [customer.id]
    );

    // 5. Retrieve products for each order
    const orderIds = orders.map((order) => order.id);

    let items = [];

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => "?").join(",");

      const [orderItems] = await db.query(
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
         WHERE order_id IN (${placeholders})
         ORDER BY id ASC`,
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
        id: customer.id,
        full_name: customer.full_name,
        phone: customer.phone,
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

module.exports = {
  getCustomerOrderHistory,
};