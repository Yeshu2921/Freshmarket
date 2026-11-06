import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Cart.css";

const IMAGE_BASE = "http://localhost:5134";
const CART_KEY = "freshmartCart";

function readCart() {
  try {
    const saved = sessionStorage.getItem(CART_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("freshmart-cart-updated"));
  } catch (error) {
    console.error("Could not save cart:", error);
  }
}

function imageUrl(value) {
  if (!value) return "";

  const path = String(value).trim();

  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  return `${IMAGE_BASE}/${path.replace(/^\/+/, "")}`;
}

function money(value) {
  return `ETB ${Number(value || 0).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function priceOf(item) {
  return Math.max(
    0,
    Number(
      item.unitPrice ??
        item.unit_price ??
        item.selling_price ??
        item.price ??
        0
    ) || 0
  );
}

export default function Cart() {
  const navigate = useNavigate();

  const [cart, setCart] = useState(readCart);
  const [message, setMessage] = useState("");

  // Keep cart state in sync with AllPublicProducts and OrderPage.
  useEffect(() => {
    function syncCart() {
      setCart(readCart());
    }

    window.addEventListener("freshmart-cart-updated", syncCart);
    window.addEventListener("storage", syncCart);

    return () => {
      window.removeEventListener("freshmart-cart-updated", syncCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

  const totalQuantity = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Math.max(0, Number(item.quantity) || 0),
        0
      ),
    [cart]
  );

  const totalPrice = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          priceOf(item) * Math.max(0, Number(item.quantity) || 0),
        0
      ),
    [cart]
  );

  function updateCart(updatedCart) {
    setCart(updatedCart);
    writeCart(updatedCart);
  }

  function changeQuantity(index, amount) {
    setMessage("");

    const updatedCart = cart
      .map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        return {
          ...item,
          quantity: Math.max(
            0,
            (Number(item.quantity) || 0) + amount
          ),
        };
      })
      .filter((item) => Number(item.quantity) > 0);

    updateCart(updatedCart);
  }

  function removeItem(index) {
    const updatedCart = cart.filter(
      (_, itemIndex) => itemIndex !== index
    );

    updateCart(updatedCart);
    setMessage("Product removed from your cart.");
  }

  function continueToOrder() {
    if (cart.length === 0) {
      setMessage("Your cart is empty. Please select a product first.");
      return;
    }

    navigate("/order");
  }

  return (
    <main className="customer-cart-page">
      <div className="customer-cart-container">
        <div className="cart-heading">
          <div>
            <span className="cart-eyebrow">FRESHMART SHOPPING</span>
            <h1>My Cart</h1>
            <p>Review your selected products before placing your order.</p>
          </div>

          <Link to="/market" className="cart-continue-link">
            ← Continue shopping
          </Link>
        </div>

        {message && (
          <div className="cart-message" role="status" aria-live="polite">
            {message}
          </div>
        )}

        {cart.length === 0 ? (
          <section className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <h2>Your cart is empty</h2>
            <p>Select products from the catalogue to see them here.</p>

            <Link to="/market" className="cart-primary-button">
              Browse products
            </Link>
          </section>
        ) : (
          <>
            <section className="cart-items-section">
              <div className="cart-section-heading">
                <h2>Selected products</h2>
                <span>
                  {totalQuantity}{" "}
                  {totalQuantity === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="cart-items-list">
                {cart.map((item, index) => {
                  const quantity = Math.max(
                    0,
                    Number(item.quantity) || 0
                  );

                  const unitPrice = priceOf(item);
                  const subtotal = unitPrice * quantity;
                  const image = imageUrl(item.image);

                  const rowKey =
                    item.cartLineId ||
                    `${item.productId ?? item.product_id ?? "item"}-${
                      item.image || "no-image"
                    }-${index}`;

                  return (
                    <article className="cart-product-row" key={rowKey}>
                      <div className="cart-product-image">
                        {image ? (
                          <img
                            src={image}
                            alt={item.name || "Selected product"}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="cart-no-image">No image</span>
                        )}
                      </div>

                      <div className="cart-product-details">
                        <h3>{item.name || "Product"}</h3>

                        {item.sku && (
                          <span className="cart-product-sku">
                            SKU: {item.sku}
                          </span>
                        )}

                        <div className="cart-unit-price">
                          {money(unitPrice)}
                          <span> / {item.unit || "unit"}</span>
                        </div>

                        <div className="cart-quantity-control">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name || "product"}`}
                            onClick={() => changeQuantity(index, -1)}
                          >
                            −
                          </button>

                          <span>{quantity}</span>

                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name || "product"}`}
                            onClick={() => changeQuantity(index, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="cart-product-total">
                        <span className="cart-subtotal-label">
                          Item total
                        </span>

                        <strong>{money(subtotal)}</strong>

                        <button
                          type="button"
                          className="cart-remove-button"
                          onClick={() => removeItem(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="cart-checkout-section">
              <div className="cart-order-summary">
                <h2>Order summary</h2>

                <div className="cart-summary-line">
                  <span>Total items</span>
                  <span>{totalQuantity}</span>
                </div>

                <div className="cart-summary-line">
                  <span>Subtotal</span>
                  <span>{money(totalPrice)}</span>
                </div>

                <div className="cart-summary-line cart-grand-total">
                  <strong>Total price</strong>
                  <strong>{money(totalPrice)}</strong>
                </div>

                <p className="cart-summary-note">
                  Delivery charges, if applicable, will be shown during
                  order placement.
                </p>

                <button
                  type="button"
                  className="cart-pay-button"
                  onClick={continueToOrder}
                >
                  Continue to Order · {money(totalPrice)}
                </button>

                <p className="cart-payment-disclaimer">
                  Choose your payment method and view payment instructions
                  on the order page.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}