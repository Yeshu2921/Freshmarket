
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

    // 3. Verify PIN against ALL matching profiles
    const matchedCustomers = [];

    for (const customer of customers) {
      if (!customer.pin_hash) {
        continue;
      }

      const validPin = await bcrypt.compare(
        cleanPin,
        customer.pin_hash
      );

      if (validPin) {
        matchedCustomers.push(customer);
      }
    }

    if (matchedCustomers.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or PIN.",
      });
    }

    // 4. Collect all matching customer profile IDs
    const customerIds = matchedCustomers.map(
      (customer) => customer.id
    );

    const customerPlaceholders = customerIds
      .map(() => "?")
      .join(",");

    // 5. Retrieve orders, latest payment, and latest review
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
        p.transaction_reference,

        CASE
          WHEN r.action = 'Rejected' THEN r.reason
          ELSE NULL
        END AS order_rejection_reason

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

      LEFT JOIN (
        SELECT
          cr.order_id,
          MAX(cr.id) AS latest_review_id
        FROM customer_order_reviews cr
        GROUP BY cr.order_id
      ) latest_review
        ON latest_review.order_id = o.id

      LEFT JOIN customer_order_reviews r
        ON r.id = latest_review.latest_review_id

      WHERE o.customer_id IN (${customerPlaceholders})

      ORDER BY o.created_at DESC, o.id DESC
      `,
      customerIds
    );

    // 6. Retrieve products, including all selected product images
    const orderIds = orders.map((order) => order.id);

    let items = [];

    if (orderIds.length > 0) {
      const placeholders = orderIds
        .map(() => "?")
        .join(",");

      const [orderItems] = await db.query(
        `
        SELECT
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
        WHERE order_id IN (${placeholders})
        ORDER BY id ASC
        `,
        orderIds
      );

      // Normalize product_images JSON for frontend use.
      items = orderItems.map((item) => {
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

        // Remove empty values and duplicate image paths.
        productImages = [
          ...new Set(
            productImages.filter(
              (image) => typeof image === "string" && image.trim()
            )
          ),
        ];

        // Backward compatibility with older orders.
        if (productImages.length === 0 && item.product_image) {
          productImages = [item.product_image];
        }

        return {
          ...item,
          product_images: productImages,
        };
      });
    }

    // 7. Attach products to their corresponding orders
    const formattedOrders = orders.map((order) => ({
      ...order,
      items: items.filter(
        (item) => Number(item.order_id) === Number(order.id)
      ),
    }));

    // 8. Return customer and complete order history
    const primaryCustomer = matchedCustomers[0];

    return res.status(200).json({
      success: true,

      customer: {
        id: primaryCustomer.id,
        full_name: primaryCustomer.full_name,
        phone: primaryCustomer.phone,
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
