
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  InputGroup,
  Modal,
  Row,
  Spinner,
} from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProductSidebar from "../components/ProductSidebar";
import "./AllPublicProducts.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const IMAGE_BASE = API.replace(/\/api\/?$/, "");
const CART_KEY = "freshmartCart";
const CART_EVENT = "freshmart-cart-updated";
const MOBILE_BREAKPOINT = 767;

function getRows(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function idOf(item) {
  return String(item?.id ?? item?.category_id ?? "");
}

function parentOf(item) {
  const value = item?.parent_id ?? item?.parent_category_id ?? "";
  return value == null ? "" : String(value);
}

function nameOf(item) {
  return item?.name || item?.category_name || "Category";
}

function imageUrl(value) {
  if (!value) return "";

  const path = String(value).trim();

  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  return `${IMAGE_BASE}/${path.replace(/^\/+/, "")}`;
}

function imagesOf(product) {
  const images = Array.isArray(product?.images) ? product.images : [];

  const paths = images
    .map((item) =>
      typeof item === "string" ? item : item?.image_path
    )
    .filter(Boolean);

  if (product?.image_path) paths.unshift(product.image_path);
  else if (product?.image) paths.unshift(product.image);

  return [...new Set(paths.map(imageUrl))];
}

/*
 * Price display:
 * selling_price  = original price (bold)
 * discount_price = discount price (crossed out)
 *
 * Cart:
 * Uses discount_price as the payable price when valid.
 */
function priceDetails(product) {
  const original = Number(product?.selling_price ?? 0);
  const discount = Number(product?.discount_price ?? 0);

  const validOriginal = Number.isFinite(original) ? original : 0;
  const validDiscount = Number.isFinite(discount) ? discount : 0;

  const hasDiscount =
    validOriginal > 0 &&
    validDiscount > 0 &&
    validDiscount < validOriginal;

  return {
    original: validOriginal,
    discount: validDiscount,
    current: hasDiscount ? validDiscount : validOriginal,
    hasDiscount,
  };
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function readCart() {
  try {
    const saved = sessionStorage.getItem(CART_KEY);
    const parsed = saved ? JSON.parse(saved) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(nextCart) {
  if (nextCart.length > 0) {
    sessionStorage.setItem(CART_KEY, JSON.stringify(nextCart));
  } else {
    sessionStorage.removeItem(CART_KEY);
  }

  localStorage.removeItem(CART_KEY);

  window.dispatchEvent(new Event(CART_EVENT));
}

export default function AllPublicProducts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sidebarWrapperRef = useRef(null);

  const mainId = searchParams.get("mainCategory") || "";
  const subId = searchParams.get("subcategory") || "";

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth > MOBILE_BREAKPOINT
      : false
  );

  const [cart, setCart] = useState(readCart);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeImage, setActiveImage] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [cartMessage, setCartMessage] = useState("");

  // Keep the sidebar closed on mobile and visible on desktop.
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    }

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close the mobile category panel when the user taps outside it.
  useEffect(() => {
    function handleOutsideClick(event) {
      if (window.innerWidth > MOBILE_BREAKPOINT) return;
      if (!sidebarOpen) return;

      if (
        sidebarWrapperRef.current &&
        !sidebarWrapperRef.current.contains(event.target)
      ) {
        setSidebarOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [sidebarOpen]);

  // Escape closes the mobile menu or product image modal.
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setSelectedProduct(null);
        setZoomed(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Load the public catalogue and categories.
  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [productResponse, categoryResponse] = await Promise.all([
          fetch(`${API}/customer-products`, {
            signal: controller.signal,
          }),
          fetch(`${API}/categories/public`, {
            signal: controller.signal,
          }),
        ]);

        if (!productResponse.ok) {
          throw new Error("Could not load products.");
        }

        if (!categoryResponse.ok) {
          throw new Error("Could not load categories.");
        }

        const [productData, categoryData] = await Promise.all([
          productResponse.json(),
          categoryResponse.json(),
        ]);

        setProducts(
          getRows(productData, "products").filter((product) => {
            const status = String(product.status || "").toLowerCase();

            return (
              !status ||
              status === "active" ||
              status === "approved"
            );
          })
        );

        setCategories(getRows(categoryData, "categories"));
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load products.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => controller.abort();
  }, []);

  // Sync the cart when another component changes it.
  useEffect(() => {
    function refreshCart() {
      setCart(readCart());
    }

    window.addEventListener(CART_EVENT, refreshCart);

    function handleStorage(event) {
      if (event.key === CART_KEY) {
        refreshCart();
      }
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CART_EVENT, refreshCart);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const cartCount = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total + Math.max(0, Number(item.quantity) || 0),
        0
      ),
    [cart]
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total +
          Math.max(0, Number(item.unitPrice) || 0) *
            Math.max(0, Number(item.quantity) || 0),
        0
      ),
    [cart]
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const categoryId = String(
        product.category_id ?? product.categoryId ?? ""
      );

      const category = categories.find(
        (item) => idOf(item) === categoryId
      );

      const categoryParentId = category ? parentOf(category) : "";

      const matchesMain =
        !mainId ||
        categoryId === mainId ||
        categoryParentId === mainId;

      const matchesSub = !subId || categoryId === subId;

      const matchesSearch =
        !query ||
        String(product.name || "").toLowerCase().includes(query) ||
        String(product.sku || "").toLowerCase().includes(query) ||
        String(product.barcode || "").toLowerCase().includes(query) ||
        String(product.description || "").toLowerCase().includes(query);

      return matchesMain && matchesSub && matchesSearch;
    });
  }, [products, categories, mainId, subId, search]);

  const selectedCategory = categories.find(
    (item) => idOf(item) === (subId || mainId)
  );

  const closeSidebar = useCallback(() => {
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      setSidebarOpen(false);
    }
  }, []);

  function openProduct(product) {
    setSelectedProduct(product);
    setActiveImage(imagesOf(product)[0] || "");
    setZoomed(false);
    setCartMessage("");
  }

  function closeProduct() {
    setSelectedProduct(null);
    setActiveImage("");
    setZoomed(false);
    setCartMessage("");
  }

  function addToCart(product, image) {
  const { current, original, hasDiscount } = priceDetails(product);

  const productId = String(
    product.id ?? product.product_id ?? ""
  );

  const chosenImage = image || imagesOf(product)[0] || "";

  if (!productId) {
    setCartMessage("This product cannot be added right now.");
    return;
  }

  const nextCart = [...cart];

  const existingIndex = nextCart.findIndex(
    (item) =>
      String(item.productId) === productId &&
      String(item.image || "") === chosenImage
  );

  if (existingIndex >= 0) {
    nextCart[existingIndex] = {
      ...nextCart[existingIndex],
      unitPrice: original,
      originalPrice: original,
      hasDiscount,
      quantity:
        Number(nextCart[existingIndex].quantity || 0) + 1,
    };
  } else {
    nextCart.push({
      productId,
      name: product.name || "Product",
      image: chosenImage,

      // Use selling_price for the order calculation.
      unitPrice: original,

      // Keep the discount price separately for display.
      discountPrice: current,
      originalPrice: original,
      hasDiscount,

      quantity: 1,
      unit: product.unit || "unit",
      sku: product.sku || "",
    });
  }

  setCart(nextCart);
  saveCart(nextCart);

  setCartMessage(
    `${product.name || "Product"} added to your cart.`
  );
}

  function goToOrder() {
    if (cartCount > 0) {
      navigate("/order");
    } else {
      navigate("/market");
    }
  }

  function toggleSidebar() {
    setSidebarOpen((open) => !open);
  }

  const productImages = selectedProduct
    ? imagesOf(selectedProduct)
    : [];

  const currentImage = activeImage || productImages[0] || "";

  return (
    <section className="all-public-products">
      <div className="all-products-container">
        <div
          ref={sidebarWrapperRef}
          className={`all-products-layout ${
            sidebarOpen ? "sidebar-open" : "sidebar-closed"
          }`}
        >
          {sidebarOpen && (
            <div
              className="all-products-mobile-backdrop"
              aria-hidden="true"
            />
          )}

          <aside
            className="all-products-sidebar-col"
            aria-label="Product categories"
            aria-hidden={!sidebarOpen}
            inert={!sidebarOpen}
          >
            <div className="all-products-sidebar-inner">
              <div className="all-products-sidebar-mobile-heading">
                <strong>Categories</strong>

                <button
                  type="button"
                  className="all-products-sidebar-close"
                  aria-label="Close categories"
                  onClick={() => setSidebarOpen(false)}
                >
                  ×
                </button>
              </div>

              <ProductSidebar onNavigate={closeSidebar} />
            </div>
          </aside>

          <main className="all-products-content-col">
            <div className="all-products-toolbar">
              <Button
                type="button"
                variant="outline-success"
                className="all-products-sidebar-toggle"
                onClick={toggleSidebar}
                aria-label={
                  sidebarOpen ? "Hide categories" : "Show categories"
                }
                aria-expanded={sidebarOpen}
              >
                <span
                  className="sidebar-toggle-mobile"
                  aria-hidden="true"
                >
                  ☰
                </span>

                <span className="sidebar-toggle-desktop">
                  {sidebarOpen ? "Hide categories" : "Show categories"}
                </span>
              </Button>

              <div className="all-products-toolbar-label">
                <h1>Our Products</h1>

                <p>
                  {selectedCategory
                    ? nameOf(selectedCategory)
                    : "Browse our supermarket catalogue"}
                </p>
              </div>

              <div className="all-products-cart-actions">
                <div className="all-products-cart-summary">
                  <span
                    className="all-products-cart-icon"
                    aria-hidden="true"
                  >
                    🛒
                  </span>

                  <span>Items: </span>
                  <strong>{cartCount}</strong>

                  <span className="all-products-cart-total">
                    ETB {formatPrice(cartTotal)}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="success"
                  className="all-products-order-button"
                  onClick={goToOrder}
                  disabled={cartCount === 0}
                >
                  Order
                </Button>
              </div>
            </div>

            <InputGroup className="all-products-search">
              <InputGroup.Text aria-hidden="true">
                ⌕
              </InputGroup.Text>

              <Form.Control
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products, SKU or barcode..."
                aria-label="Search products"
              />

              {search && (
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => setSearch("")}
                >
                  Clear
                </Button>
              )}
            </InputGroup>

            {error && (
              <Alert variant="danger" className="mt-3">
                {error}

                <div className="mt-2">
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </Button>
                </div>
              </Alert>
            )}

            {cartMessage && (
              <Alert
                variant="success"
                dismissible
                onClose={() => setCartMessage("")}
                className="all-products-cart-message"
              >
                {cartMessage}
              </Alert>
            )}

            {loading ? (
              <div className="all-products-loading">
                <Spinner animation="border" variant="success" />
                <span>Loading products...</span>
              </div>
            ) : (
              <>
                <div className="all-products-results-bar">
                  <span>
                    {filteredProducts.length} product
                    {filteredProducts.length === 1 ? "" : "s"} found
                  </span>

                  {(mainId || subId) && (
                    <Button
                      variant="link"
                      className="all-products-clear-filter"
                      onClick={() => navigate("/market")}
                    >
                      Clear category
                    </Button>
                  )}
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="all-products-empty">
                    <div className="all-products-empty-icon">
                      🛍️
                    </div>

                    <h2>No products found</h2>
                    <p>Try another category or search term.</p>

                    <Button
                      variant="outline-success"
                      onClick={() => {
                        setSearch("");
                        navigate("/market");
                      }}
                    >
                      Show all products
                    </Button>
                  </div>
                ) : (
                  <Row className="all-products-grid">
                    {filteredProducts.map((product) => {
                      const productId =
                        product.id ?? product.product_id;

                      const images = imagesOf(product);
                      const image = images[0] || "";

                      const {
                        original,
                        discount,
                        hasDiscount,
                      } = priceDetails(product);

                      return (
                        <Col
                          key={productId}
                          xs={6}
                          sm={4}
                          md={4}
                          lg={3}
                          xl={3}
                          className="all-products-grid-col"
                        >
                          <Card className="all-product-card h-100">
                            <button
                              type="button"
                              className="all-product-image-button"
                              onClick={() => openProduct(product)}
                              aria-label={`View ${
                                product.name || "product"
                              } images`}
                            >
                              {image ? (
                                <Card.Img
                                  variant="top"
                                  src={image}
                                  alt={product.name || "Product"}
                                  className="all-product-card-image"
                                  onError={(event) => {
                                    event.currentTarget.style.visibility =
                                      "hidden";
                                  }}
                                />
                              ) : (
                                <div className="all-product-no-image">
                                  No image
                                </div>
                              )}

                              {hasDiscount && (
                                <Badge
                                  bg="danger"
                                  className="all-product-sale"
                                >
                                  Sale
                                </Badge>
                              )}
                            </button>

                            <Card.Body className="all-product-card-body">
                              <Card.Title className="all-product-name">
                                {product.name || "Unnamed product"}
                              </Card.Title>

                              {product.unit && (
                                <div className="all-product-unit">
                                  Per {product.unit}
                                </div>
                              )}

                              <div className="all-product-price">
                                <strong>
                                  ETB {formatPrice(original)}
                                </strong>

                                {hasDiscount && (
                                  <del>
                                    ETB {formatPrice(discount)}
                                  </del>
                                )}
                              </div>

                              <Button
                                type="button"
                                variant="success"
                                className="all-product-add-button"
                                onClick={() => openProduct(product)}
                              >
                                View / Add
                              </Button>
                            </Card.Body>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <Modal
        show={Boolean(selectedProduct)}
        onHide={closeProduct}
        centered
        size="lg"
        className="all-product-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {selectedProduct?.name || "Product details"}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {selectedProduct && (
            <Row className="g-4">
              <Col md={6}>
                <div
                  className={`all-product-modal-image-wrap ${
                    zoomed ? "zoomed" : ""
                  }`}
                >
                  {currentImage ? (
                    <img
                      src={currentImage}
                      alt={selectedProduct.name || "Product"}
                      className="all-product-modal-image"
                      onClick={() =>
                        setZoomed((value) => !value)
                      }
                    />
                  ) : (
                    <div className="all-product-no-image">
                      No image available
                    </div>
                  )}
                </div>

                {productImages.length > 1 && (
                  <div className="all-product-thumbnails">
                    {productImages.map((image, index) => (
                      <button
                        type="button"
                        key={`${image}-${index}`}
                        className={`all-product-thumbnail ${
                          currentImage === image ? "active" : ""
                        }`}
                        onClick={() => {
                          setActiveImage(image);
                          setZoomed(false);
                        }}
                        aria-label={`View image ${index + 1}`}
                      >
                        <img src={image} alt="" />
                      </button>
                    ))}
                  </div>
                )}

                <p className="all-product-zoom-hint">
                  Click the image to zoom in or out.
                </p>
              </Col>

              <Col md={6}>
                <h3 className="all-product-modal-name">
                  {selectedProduct.name}
                </h3>

                {selectedProduct.description && (
                  <p className="all-product-modal-description">
                    {selectedProduct.description}
                  </p>
                )}

                {selectedProduct.sku && (
                  <p className="all-product-modal-detail">
                    <strong>SKU:</strong> {selectedProduct.sku}
                  </p>
                )}

                {selectedProduct.barcode && (
                  <p className="all-product-modal-detail">
                    <strong>Barcode:</strong> {selectedProduct.barcode}
                  </p>
                )}

                {selectedProduct.unit && (
                  <p className="all-product-modal-detail">
                    <strong>Unit:</strong> {selectedProduct.unit}
                  </p>
                )}

                {(() => {
                  const {
                    original,
                    discount,
                    hasDiscount,
                  } = priceDetails(selectedProduct);

                  return (
                    <div className="all-product-modal-price">
                      <strong>
                        ETB {formatPrice(original)}
                      </strong>

                      {hasDiscount && (
                        <del>
                          ETB {formatPrice(discount)}
                        </del>
                      )}
                    </div>
                  );
                })()}

                <Button
                  type="button"
                  variant="success"
                  className="w-100 mt-3"
                  onClick={() =>
                    addToCart(selectedProduct, currentImage)
                  }
                >
                  Add to cart
                </Button>

                {cartMessage && (
                  <Alert variant="success" className="mt-3 mb-0">
                    {cartMessage}
                  </Alert>
                )}
              </Col>
            </Row>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeProduct}>
            Close
          </Button>

          <Button
            type="button"
            variant="success"
            onClick={() => {
              closeProduct();
              goToOrder();
            }}
            disabled={cartCount === 0}
          >
            Go to order ({cartCount})
          </Button>
        </Modal.Footer>
      </Modal>
    </section>
  );
}
