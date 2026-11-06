import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Image,
  Modal,
  Row,
  Spinner,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./OrderPage.css";
const API = "http://localhost:5134/api";
const IMAGE_BASE = "http://localhost:5134";
const CART_KEY = "freshmartCart";
const CART_EVENT = "freshmart-cart-updated";
const MAX_QUANTITY = 1000;
// SAMPLE receiver details: replace these with verified account details.
const PAYMENT_DETAILS = {
  "CBE": {
    receiver: "Yeshambel Bazezew Mekonen",
    account: "100513333866",
    type: "Bank account",
  },
  "CBE Birr": {
    receiver: "Yeshambel Bazezew Mekonen",
    account: "0912345678",
    type: "CBE Birr wallet",
  },
  "Dashen Bank": {
    receiver: "Yeshambel Bazezew Mekonen",
    account: "1000123456789",
    type: "Bank account",
  },
  "Telebirr": {
    receiver: "Abebe Kebed Tesma",
    account: "0991324567",
    type: "Telebirr wallet",
  },
  "Bank of Abyssinia": {
    receiver: "Yeshambel Bazezew Mekonen",
    account: "100012345678",
    type: "Bank account",
  },
  "Awash Bank": {
    receiver: "Yeshambel Bazezew Mekonen",
    account: "100012345678",
    type: "Bank account",
  },
  "Cibbirr": {
    receiver: "Yeshambel Bazezew Mekonen",
    account: "0912345678",
    type: "Cibbirr wallet",
  },
};
const PAYMENT_METHODS = [
  "Cash on Delivery",
  "CBE",
  "CBE Birr",
  "Dashen Bank",
  "Telebirr",
  "Bank of Abyssinia",
  "Awash Bank",
  "Cibbirr",
];
const emptyCustomer = {
  fullName: "",
  phone: "",
  deliveryLocation: "",
  pin: "",
  confirmPin: "",
};
function getStoredCart() {
  try {
    const sessionCart = sessionStorage.getItem(CART_KEY);
    if (sessionCart !== null) {
      const parsed = JSON.parse(sessionCart);
      return Array.isArray(parsed) ? parsed : [];
    }
    // Migrate older cart data only if the session cart is absent.
    const localCart = localStorage.getItem(CART_KEY);
    if (localCart !== null) {
      const parsed = JSON.parse(localCart);
      if (Array.isArray(parsed)) {
        sessionStorage.setItem(CART_KEY, JSON.stringify(parsed));
        localStorage.removeItem(CART_KEY);
        return parsed;
      }
    }
    return [];
  } catch {
    return [];
  }
}
function getProductId(item) {
  return (
    item.productId ??
    item.product_id ??
    item.product?.id ??
    item.id
  );
}
function getProductName(item) {
  return (
    item.name ??
    item.product_name ??
    item.product?.name ??
    "Product"
  );
}
function getProductPrice(item) {
  const price = Number(
    item.unitPrice ??
    item.originalPrice ??
    item.selling_price ??
    item.unit_price ??
    item.price ??
    item.product?.selling_price ??
    0
  );

  return Number.isFinite(price) && price >= 0 ? price : 0;
}
function getProductImage(item) {
  const image =
    item.image ??
    item.imageUrl ??
    item.image_url ??
    item.image_path ??
    item.product_image ??
    item.product?.image_path ??
    "";
  if (typeof image !== "string" || !image.trim()) {
    return "";
  }
  const cleanImage = image.trim();
  if (/^(https?:\/\/|data:|blob:)/i.test(cleanImage)) {
  return cleanImage;
}

return `${IMAGE_BASE}/${cleanImage.replace(/^\/+/, "")}`};
function getQuantity(item) {
  const quantity = Math.floor(Number(item.quantity) || 1);
  return Math.min(MAX_QUANTITY, Math.max(1, quantity));
}
function notifyCartUpdated() {
  window.dispatchEvent(new Event(CART_EVENT));
}
function saveCart(cart) {
  try {
    if (cart.length > 0) {
      sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
    } else {
      sessionStorage.removeItem(CART_KEY);
    }
    localStorage.removeItem(CART_KEY);
    notifyCartUpdated();
  } catch (error) {
    console.error("Unable to save cart:", error);
  }
}
export default function OrderPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(getStoredCart);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [paymentMethod, setPaymentMethod] = useState(
    "Cash on Delivery"
  );
  const [receipt, setReceipt] = useState(null);
  const [receiptName, setReceiptName] = useState("");
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const isCash = paymentMethod === "Cash on Delivery";
  const paymentDetails = PAYMENT_DETAILS[paymentMethod];
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + getProductPrice(item) * getQuantity(item),
        0
      ),
    [cart]
  );
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + getQuantity(item), 0),
    [cart]
  );
  // Persist changes made from the order page.
  useEffect(() => {
    saveCart(cart);
  }, [cart]);
  // Update this page if another component changes the cart.
  useEffect(() => {
    function handleCartUpdate() {
      const updatedCart = getStoredCart();
      setCart((currentCart) => {
        if (
          JSON.stringify(currentCart) === JSON.stringify(updatedCart)
        ) {
          return currentCart;
        }
        return updatedCart;
      });
    }
    window.addEventListener(CART_EVENT, handleCartUpdate);
    return () => {
      window.removeEventListener(CART_EVENT, handleCartUpdate);
    };
  }, []);
  function updateCustomer(event) {
    const { name, value } = event.target;
    setCustomer((previous) => ({
      ...previous,
      [name]: value,
    }));
  }
  function updateQuantity(productId, change) {
  setCart((prevCart) => {
    const updatedCart = prevCart.map((item) => {
      if (String(getProductId(item)) !== String(productId)) {
        return item;
      }
      const newQuantity = Math.min(
        MAX_QUANTITY,
        Math.max(1, getQuantity(item) + change)
      );
      return {
        ...item,
        quantity: newQuantity,
      };
    });
    saveCart(updatedCart);
    return updatedCart;
  });
}
  function removeItem(productId) {
    setCart((previous) =>
      previous.filter(
        (item) =>
          String(getProductId(item)) !== String(productId)
      )
    );
  }
  function handlePaymentMethodChange(event) {
    const selectedMethod = event.target.value;
    setPaymentMethod(selectedMethod);
    setReceipt(null);
    setReceiptName("");
    setError("");
    if (selectedMethod !== "Cash on Delivery") {
      setShowPaymentDetails(true);
    } else {
      setShowPaymentDetails(false);
    }
  }
  function handleReceiptChange(event) {
    const file = event.target.files?.[0];
    setReceipt(null);
    setReceiptName("");
    if (!file) return;
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError("Please select a JPG, PNG, or WEBP receipt image.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The receipt image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setError("");
    setReceipt(file);
    setReceiptName(file.name);
  }
  function validateForm() {
    if (cart.length === 0) {
      return "Your cart is empty. Please add products before ordering.";
    }
    if (!customer.fullName.trim()) {
      return "Please enter your full name.";
    }
    if (!customer.phone.trim()) {
      return "Please enter your phone number.";
    }
if (!/^\d{4,6}$/.test(customer.pin)) {
      return "Your reusable PIN must contain 4 to 6 digits.";
    }
    if (customer.pin !== customer.confirmPin) {
      return "The PIN and confirmation PIN do not match.";
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return "Please select a valid payment method.";
    }
    if (!isCash && !receipt) {
      return "Please upload your payment receipt.";
    }
    for (const item of cart) {
      const productId = getProductId(item);
      const quantity = Number(item.quantity);
      if (
        !productId ||
        !Number.isInteger(Number(productId))
      ) {
        return "A product in your cart has an invalid ID. Please remove it and add it again.";
      }
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QUANTITY
      ) {
        return `Each product quantity must be between 1 and ${MAX_QUANTITY}.`;
      }
    }
    return "";
  }
  async function submitOrder(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("fullName", customer.fullName.trim());
      formData.append("phone", customer.phone.trim());
      formData.append(
        "deliveryLocation",
        customer.deliveryLocation.trim()
      );
      formData.append("pin", customer.pin);
      formData.append("paymentMethod", paymentMethod);
      formData.append(
        "items",
        JSON.stringify(
          cart.map((item) => ({
            productId: Number(getProductId(item)),
            quantity: getQuantity(item),
          }))
        )
      );
      if (receipt && !isCash) {
        formData.append("receipt", receipt);
      }
      const response = await fetch(`${API}/customer-orders`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to submit your order. Please try again."
        );
      }
      // Clear only after the server confirms successful submission.
      sessionStorage.removeItem(CART_KEY);
      localStorage.removeItem(CART_KEY);
      setCart([]);
      notifyCartUpdated();
      setCustomer(emptyCustomer);
      setReceipt(null);
      setReceiptName("");
      setPaymentMethod("Cash on Delivery");
      setShowPaymentDetails(false);
      setSuccess(
        `Your order was submitted successfully${
          data.order?.order_number
            ? `. Order number: ${data.order.order_number}`
            : ""
        }. Please keep your phone number and PIN to check order history.`
      );
    } catch (err) {
      setError(
        err.message ||
          "A network error occurred. Please check that the server is running."
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="customer-order-page">
      <div className="customer-order-container">
        <div className="customer-order-heading">
          <div>
            <span className="customer-order-eyebrow">FRESHMART</span>
            <h1>Complete Your Order</h1>
            <p>
              Enter your delivery information and choose how you want to pay.
            </p>
          </div>
          <Button
            type="button"
            variant="outline-success"
            className="customer-order-back-button"
            onClick={() => navigate("/market")}
          >
            ← Continue Shopping
          </Button>
        </div>
        {error && (
          <Alert
            variant="danger"
            dismissible
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}
        {success && (
          <Alert
            variant="success"
            dismissible
            onClose={() => setSuccess("")}
          >
            {success}
            <div className="mt-3">
              <Button
                type="button"
                variant="success"
                onClick={() => navigate("/market")}
              >
                Continue Shopping
              </Button>
            </div>
          </Alert>
        )}
        {cart.length === 0 ? (
          <Card className="customer-order-empty-card">
            <Card.Body>
              <div className="customer-order-empty-icon">🛒</div>
              <h3>Your cart is empty</h3>
              <p>
                Add products to your cart before completing an order.
              </p>
              <Button
                type="button"
                variant="success"
                onClick={() => navigate("/market")}
              >
                Browse Products
              </Button>
            </Card.Body>
          </Card>
        ) : (
          <Form onSubmit={submitOrder}>
            <Row className="g-4">
              <Col lg={7}>
                <Card className="customer-order-card">
                  <Card.Body>
                    <div className="customer-order-section-heading">
                      <span className="customer-order-step">1</span>
                      <div>
                        <h2>Customer Information</h2>
                        <p>Use a phone number you can access later.</p>
                      </div>
                    </div>
                    <Form.Group className="mb-3">
                      <Form.Label>Full Name *</Form.Label>
                      <Form.Control
                        name="fullName"
                        value={customer.fullName}
                        onChange={updateCustomer}
                        placeholder="Enter your full name"
                        autoComplete="name"
                        maxLength={150}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Phone Number *</Form.Label>
                      <Form.Control
                        name="phone"
                        value={customer.phone}
                        onChange={updateCustomer}
                        placeholder="Enter your phone number"
                        autoComplete="tel"
                        maxLength={30}
                        required
                      />
                      <Form.Text className="text-muted">
                        Keep this number to access your order history.
                      </Form.Text>
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Delivery Location (Optional)</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        id="deliveryLocation"
                        name="deliveryLocation"
                        value={customer.deliveryLocation}
                        onChange={updateCustomer}
                        placeholder="Enter your delivery location (optional)"
                        maxLength={500}
                      />
                      <Form.Text className="text-muted">
                        You can leave this field empty if you do not have a delivery location yet.
                      </Form.Text>
                    </Form.Group>
                    <div className="customer-order-pin-note">
                      <strong>Create a reusable PIN</strong>
                      <p>
                        Use a PIN you can remember. Your server must store
                        a secure hash, never the plain PIN.
                      </p>
                    </div>
                    <Row className="g-3">
                      <Col sm={6}>
                        <Form.Group>
                          <Form.Label>PIN (4–6 digits) *</Form.Label>
                          <Form.Control
                            type="password"
                            inputMode="numeric"
                            name="pin"
                            value={customer.pin}
                            onChange={updateCustomer}
                            placeholder="Create PIN"
                            autoComplete="new-password"
                            pattern="[0-9]{4,6}"
                            maxLength={6}
                            required
                          />
                        </Form.Group>
                      </Col>
                      <Col sm={6}>
                        <Form.Group>
                          <Form.Label>Confirm PIN *</Form.Label>
                          <Form.Control
                            type="password"
                            inputMode="numeric"
                            name="confirmPin"
                            value={customer.confirmPin}
                            onChange={updateCustomer}
                            placeholder="Confirm PIN"
                            autoComplete="new-password"
                            pattern="[0-9]{4,6}"
                            maxLength={6}
                            required
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
                <Card className="customer-order-card mt-4">
                  <Card.Body>
                    <div className="customer-order-section-heading">
                      <span className="customer-order-step">2</span>
                      <div>
                        <h2>Payment Method</h2>
                        <p>Choose your preferred payment option.</p>
                      </div>
                    </div>
                    <Form.Group className="mb-3">
                      <Form.Label>Payment Method *</Form.Label>
                      <Form.Select
                        value={paymentMethod}
                        onChange={handlePaymentMethodChange}
                        required
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                    {isCash ? (
                      <Alert variant="info" className="mb-0">
                        <strong>Cash on Delivery</strong>
                        <p className="mb-0 mt-1">
                          Pay when your order is delivered. Your order must
                          not be marked as paid until the cash is received.
                        </p>
                      </Alert>
                    ) : (
                      <div className="customer-order-receipt-box">
                        {paymentDetails && (
                          <Alert variant="primary">
                            <h5 className="mb-3">
                              Payment Account Details
                            </h5>
                            <p className="mb-2">
                              <strong>Payment method:</strong>{" "}
                              {paymentMethod}
                            </p>
                            <p className="mb-2">
                              <strong>Receiver name:</strong>{" "}
                              {paymentDetails.receiver}
                            </p>
                            <p className="mb-2">
                              <strong>{paymentDetails.type}:</strong>{" "}
                              {paymentDetails.account}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline-primary"
                              onClick={() => setShowPaymentDetails(true)}
                            >
                              View Account Details
                            </Button>
                          </Alert>
                        )}
                        <Form.Group>
                          <Form.Label>Payment Receipt Image *</Form.Label>
                          <Form.Control
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleReceiptChange}
                            required={!isCash}
                          />
                          <Form.Text className="text-muted">
                            JPG, PNG, or WEBP; maximum 5 MB.
                          </Form.Text>
                        </Form.Group>
                        {receiptName && (
                          <Alert variant="success" className="mt-3 mb-0">
                            Selected receipt: {receiptName}
                          </Alert>
                        )}
                        <p className="customer-order-payment-warning">
                          Your electronic payment remains pending until
                          authorized staff verify it.
                        </p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
              <Col lg={5}>
                <Card className="customer-order-card customer-order-summary-card">
                  <Card.Body>
                    <div className="customer-order-section-heading">
                      <span className="customer-order-step">3</span>
                      <div>
                        <h2>Order Summary</h2>
                        <p>
                          {itemCount} item{itemCount !== 1 ? "s" : ""} in
                          your cart
                        </p>
                      </div>
                    </div>
                    <div className="customer-order-items">
                      {cart.map((item, index) => {
                        const id = getProductId(item);
                        const quantity = getQuantity(item);
                        const price = getProductPrice(item);
                        const image = getProductImage(item);
                        const name = getProductName(item);
                        return (
                          <div
                            className="customer-order-item"
                            key={id ?? index}
                          >
                            <div className="customer-order-item-image">
                              {image ? (
                                <Image
                                  src={image}
                                  alt={name}
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <span>📦</span>
                              )}
                            </div>
                            <div className="customer-order-item-details">
                              <h3>{name}</h3>
                              <p>{price.toFixed(2)} ETB each</p>
                              <div className="customer-order-quantity">
                                <Button
                                  type="button"
                                  variant="outline-secondary"
                                  aria-label={`Decrease ${name} quantity`}
                                  onClick={() => updateQuantity(id, -1)}
                                  disabled={quantity <= 1}
                                >
                                  −
                                </Button>
                                <span>{quantity}</span>
                                <Button
                                  type="button"
                                  variant="outline-secondary"
                                  aria-label={`Increase ${name} quantity`}
                                  onClick={() => updateQuantity(id, 1)}
                                  disabled={quantity >= MAX_QUANTITY}
                                  title={
                                    quantity >= MAX_QUANTITY
                                      ? `Maximum quantity is ${MAX_QUANTITY}`
                                      : "Increase quantity"
                                  }
                                >
                                  +
                                </Button>
                                <Button
                                  type="button"
                                  variant="link"
                                  className="customer-order-remove"
                                  onClick={() => removeItem(id)}
                                >
                                  Remove
                                </Button>
                              </div>
                              {quantity >= MAX_QUANTITY && (
                                <small className="text-muted">
                                  Maximum quantity: {MAX_QUANTITY}
                                </small>
                              )}
                            </div>
                            <strong className="customer-order-line-total">
                              {(price * quantity).toFixed(2)}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                    <div className="customer-order-totals">
                      <div>
                        <span>Subtotal</span>
                        <strong>{subtotal.toFixed(2)} ETB</strong>
                      </div>
                      <div>
                        <span>Delivery fee</span>
                        <Badge bg="secondary">To be confirmed</Badge>
                      </div>
                      <div className="customer-order-grand-total">
                        <span>Total before delivery fee</span>
                        <strong>{subtotal.toFixed(2)} ETB</strong>
                      </div>
                    </div>
                    <Alert variant="warning" className="small mt-3">
                      This is an estimate. The server must calculate the
                      final price and delivery fee using trusted data.
                    </Alert>
                    <Button
                      type="submit"
                      variant="success"
                      className="customer-order-submit"
                      disabled={loading || cart.length === 0 || Boolean(success)}
                    >
                      {loading ? (
                        <>
                          <Spinner
                            size="sm"
                            animation="border"
                            className="me-2"
                          />
                          Submitting Order...
                        </>
                      ) : (
                        "Place Order"
                      )}
                    </Button>
                    <p className="customer-order-secure-note">
                      Your order will be processed after it is received by
                      FreshMart.
                    </p>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Form>
        )}
        <Modal
          show={showPaymentDetails && !isCash}
          onHide={() => setShowPaymentDetails(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>{paymentMethod} Account Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {paymentDetails && (
              <>
                <p>
                  <strong>Receiver:</strong> {paymentDetails.receiver}
                </p>
                <p>
                  <strong>{paymentDetails.type}:</strong>{" "}
                  {paymentDetails.account}
                </p>
                <Alert variant="warning" className="mb-0">
                  These are sample details for development. Verify the
                  correct account information before accepting real payments.
                </Alert>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="success"
              onClick={() => setShowPaymentDetails(false)}
            >
              Done
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
}
