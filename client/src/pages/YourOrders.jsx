
import { useState } from "react";
import {
  Alert,Badge, Button, Card,Col, Container, Form, Row, Spinner,
} from "react-bootstrap";
import {
  Search,
  Bag,
  Box,
  Calendar,
  CreditCard,
  GeoAlt,
  Lock,
} from "react-bootstrap-icons";
import "./YourOrders.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const IMAGE_BASE = API.replace(/\/api\/?$/, "");

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} ETB`;
}

function getProductImage(image) {
  if (!image) return "/placeholder-product.png";

  if (/^(https?:\/\/|data:|blob:)/i.test(image)) {
    return image;
  }

  return `${IMAGE_BASE}/${image.replace(/^\/+/, "")}`;
}

function statusVariant(status) {
  const value = String(status || "").toLowerCase();

  if (
    value.includes("complete") ||
    value.includes("delivered") ||
    value.includes("confirmed") ||
    value.includes("approved")
  ) {
    return "success";
  }

  if (
    value.includes("reject") ||
    value.includes("cancel")
  ) {
    return "danger";
  }

  if (value.includes("pending")) {
    return "warning";
  }

  if (
    value.includes("process") ||
    value.includes("preparing") ||
    value.includes("ready") ||
    value.includes("delivery")
  ) {
    return "primary";
  }

  return "secondary";
}

function paymentVariant(status) {
  const value = String(status || "").toLowerCase();

  if (value === "paid" || value === "approved") {
    return "success";
  }

  if (
    value.includes("reject") ||
    value.includes("fail")
  ) {
    return "danger";
  }

  if (value.includes("pending")) {
    return "warning";
  }

  return "secondary";
}

export default function YourOrders() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [orders, setOrders] = useState([]);
  const [customer, setCustomer] = useState(null);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(event) {
    event.preventDefault();

    setError("");
    setSearched(false);
    setOrders([]);
    setCustomer(null);

    const cleanPhone = phone.trim();
    const cleanPin = pin.trim();

    if (!cleanPhone || !cleanPin) {
      setError("Please enter your phone number and PIN.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API}/customer-orders/lookup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: cleanPhone,
            pin: cleanPin,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to retrieve your orders."
        );
      }

      setCustomer(data.customer || null);
      setOrders(
        Array.isArray(data.orders) ? data.orders : []
      );
      setSearched(true);
    } catch (err) {
      setOrders([]);
      setCustomer(null);
      setSearched(false);

      setError(
        err.message ||
          "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="your-orders-page">
      <Container>
        {/* Page heading */}
        <div className="orders-heading">
          <div className="orders-heading-icon">
            <Bag />
          </div>

          <div>
            <h2>Your Orders</h2>
            <p>
              Track your purchases and check your order updates.
            </p>
          </div>
        </div>

        {/* Customer lookup */}
        <Card className="orders-search-card">
          <Card.Body>
            <div className="orders-search-title">
              <div className="orders-search-icon">
                <Lock />
              </div>

              <div>
                <h5>Find Your Orders</h5>
                <p>
                  Enter the phone number and PIN used when ordering.
                </p>
              </div>
            </div>

            <Form onSubmit={handleSearch}>
              <Row className="g-3 align-items-end">
                <Col md={5}>
                  <Form.Group>
                    <Form.Label>Phone Number</Form.Label>

                    <Form.Control
                      type="tel"
                      placeholder="Enter your phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      required
                    />
                  </Form.Group>
                </Col>

                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Order PIN</Form.Label>

                    <Form.Control
                      type="password"
                      inputMode="numeric"
                      placeholder="Enter your PIN"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </Form.Group>
                </Col>

                <Col md={3}>
                  <Button
                    type="submit"
                    className="orders-search-button w-100"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner
                          size="sm"
                          animation="border"
                          className="me-2"
                        />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="me-2" />
                        Find Orders
                      </>
                    )}
                  </Button>
                </Col>
              </Row>
            </Form>

            {error && (
              <Alert variant="danger" className="mt-3 mb-0">
                {error}
              </Alert>
            )}
          </Card.Body>
        </Card>

        {/* Results heading */}
        <div className="orders-results-heading">
          <div>
            <h4>Order History</h4>
            <p>Your orders and their current status</p>
          </div>

          {orders.length > 0 && (
            <Badge bg="primary">
              {orders.length} Orders
            </Badge>
          )}
        </div>

        {/* Initial state */}
        {!searched && !loading && (
          <div className="orders-empty-state">
            <div className="orders-empty-icon">
              <Box />
            </div>

            <h5>View Your Order History</h5>

            <p>
              Enter your phone number and PIN above to see your
              orders, products and payment information.
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="orders-empty-state">
            <Spinner animation="border" variant="primary" />

            <h5 className="mt-3">Finding Your Orders</h5>

            <p>Please wait while we retrieve your order history.</p>
          </div>
        )}

        {/* No orders */}
        {searched && orders.length === 0 && !loading && (
          <div className="orders-empty-state">
            <div className="orders-empty-icon">
             <Bag />
              </div>

            <h5>No Orders Found</h5>

            <p>
              You have not placed any orders using this phone number.
            </p>
          </div>
        )}

        {/* Customer order results */}
        {searched && orders.length > 0 && (
          <>
            {customer && (
              <div className="orders-customer-info">
                <strong>{customer.full_name}</strong>
                <span>{customer.phone}</span>
                <span>
                  {orders.length} order(s) found
                </span>
              </div>
            )}

            <div className="orders-list">
              {orders.map((order) => (
                <Card
                  className="customer-order-card"
                  key={order.id}
                >
                  <Card.Body>
                    {/* Order heading */}
                    <div className="order-card-top">
                      <div>
                        <span className="order-number-label">
                          ORDER NUMBER
                        </span>

                        <h5>{order.order_number}</h5>
                      </div>

                      <Badge bg={statusVariant(order.order_status)}>
                        {order.order_status}
                      </Badge>
                    </div>

                    {/* Order date */}
                    <div className="order-date">
                      <Calendar />
                      <span>{formatDate(order.created_at)}</span>
                    </div>

                    {/* Products */}
                    <div className="order-products">
                      {order.items?.map((item, index) => (
                        <div
                          className="order-product-row"
                          key={item.id || `${order.id}-${index}`}
                        >
                          <div className="order-product-image">
                            <img
                              src={getProductImage(item.product_image)}
                              alt={item.product_name}
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src =
                                  "/placeholder-product.png";
                              }}
                            />
                          </div>

                          <div className="order-product-info">
                            <h6>{item.product_name}</h6>

                            <span>
                              Quantity: {item.quantity}
                            </span>

                            <span>
                              Unit price: {money(item.unit_price)}
                            </span>
                          </div>

                          <strong className="order-product-total">
                            {money(item.line_total)}
                          </strong>
                        </div>
                      ))}
                    </div>

                    {/* Order totals */}
                    <div className="order-total-row">
                      <span>Subtotal</span>
                      <strong>{money(order.subtotal)}</strong>
                    </div>

                    <div className="order-total-row">
                      <span>Delivery Fee</span>
                      <strong>{money(order.delivery_fee)}</strong>
                    </div>

                    <div className="order-total-row">
                      <span>Total Amount</span>
                      <strong>{money(order.grand_total)}</strong>
                    </div>

                    {/* Order information */}
                    <Row className="g-3 order-information">
                      <Col sm={6}>
                        <div className="order-info-box">
                          <span>
                            <Box /> Order Status
                          </span>

                          <Badge bg={statusVariant(order.order_status)}>
                            {order.order_status}
                          </Badge>
                        </div>
                      </Col>

                      <Col sm={6}>
                        <div className="order-info-box">
                          <span>
                            <CreditCard /> Payment Status
                          </span>

                          <Badge
                            bg={paymentVariant(order.payment_status)}
                          >
                            {order.payment_status || "Unavailable"}
                          </Badge>
                        </div>
                      </Col>
                    </Row>

                    {/* Payment method */}
                    <div className="order-location">
                      <CreditCard />
                      <span>
                        Payment Method: {order.payment_method}
                      </span>
                    </div>

                    {/* Payment rejection reason */}
                    {order.payment_rejection_reason && (
                      <Alert
                        variant="danger"
                        className="order-rejection"
                      >
                        <strong>
                          Payment Rejection Reason:
                        </strong>

                        <p className="mb-0">
                          {order.payment_rejection_reason}
                        </p>
                      </Alert>
                    )}

                    {/* Delivery location */}
                    {order.delivery_location && (
                      <div className="order-location">
                        <GeoAlt />
                        <span>{order.delivery_location}</span>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              ))}
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
