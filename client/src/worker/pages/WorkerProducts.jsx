
import { useEffect, useMemo, useState } from "react";

import "./WorkerProduct.css";

const API = "http://localhost:5134/api";
const IMAGE_BASE = "http://localhost:5134";

// Get authentication token
function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

// Build product image URL
function getImageUrl(path) {
  if (!path) return "";

  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  return `${IMAGE_BASE}/${String(path).replace(/^\/+/, "")}`;
}

// Get all product images
function getProductImages(product) {
  const images = Array.isArray(product.images)
    ? product.images
        .map((image) =>
          typeof image === "string"
            ? image
            : image?.image_path || image?.image_url || image?.url
        )
        .filter(Boolean)
    : [];

  if (images.length) return images;

  return product.image_path ? [product.image_path] : [];
}

// Format currency
function money(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function WorkerProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const [zoomProduct, setZoomProduct] = useState(null);
  const [zoomIndex, setZoomIndex] = useState(0);

  // API request
  async function request(path) {
    const token = getToken();

    const response = await fetch(`${API}${path}`, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    });

    const contentType = response.headers.get("content-type") || "";

    const result = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        result?.message ||
          result?.error ||
          "Unable to load product information."
      );
    }

    return result;
  }

  // Load products, categories and brands
  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [productResult, categoryResult, brandResult] =
        await Promise.all([
          request("/products"),
          request("/categories"),
          request("/brands"),
        ]);

      setProducts(
        Array.isArray(productResult)
          ? productResult
          : productResult.products || productResult.data || []
      );

      setCategories(
        Array.isArray(categoryResult)
          ? categoryResult
          : categoryResult.categories || categoryResult.data || []
      );

      setBrands(
        Array.isArray(brandResult)
          ? brandResult
          : brandResult.brands || brandResult.data || []
      );
    } catch (err) {
      console.error("Worker products loading error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Load data when the page opens
  useEffect(() => {
    loadData();
  }, []);

  // Image zoom keyboard controls
  useEffect(() => {
    if (!zoomProduct) return;

    function handleKeyDown(event) {
      const images = getProductImages(zoomProduct);

      if (event.key === "Escape") {
        setZoomProduct(null);
      }

      if (images.length && event.key === "ArrowRight") {
        setZoomIndex((index) => (index + 1) % images.length);
      }

      if (images.length && event.key === "ArrowLeft") {
        setZoomIndex(
          (index) => (index - 1 + images.length) % images.length
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomProduct]);

  // Search and filter products
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        [
          product.name,
          product.sku,
          product.barcode,
          product.description,
        ].some((value) =>
          String(value || "").toLowerCase().includes(term)
        );

      const matchesCategory =
        !categoryFilter ||
        String(product.category_id || "") === categoryFilter;

      const matchesBrand =
        !brandFilter ||
        String(product.brand_id || "") === brandFilter;

      const matchesStatus =
        !statusFilter || product.status === statusFilter;

      const quantity = Number(product.quantity || 0);

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in" && quantity > 0) ||
        (stockFilter === "out" && quantity <= 0) ||
        (stockFilter === "low" && quantity > 0 && quantity <= 5);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesBrand &&
        matchesStatus &&
        matchesStock
      );
    });
  }, [
    products,
    search,
    categoryFilter,
    brandFilter,
    statusFilter,
    stockFilter,
  ]);

  // Open image zoom
  function openZoom(product, index = 0) {
    if (!getProductImages(product).length) return;

    setZoomProduct(product);
    setZoomIndex(index);
  }

  const zoomImages = zoomProduct
    ? getProductImages(zoomProduct)
    : [];

  // Product summary counts
  const inStockCount = products.filter(
    (product) => Number(product.quantity || 0) > 0
  ).length;

  const outOfStockCount = products.filter(
    (product) => Number(product.quantity || 0) <= 0
  ).length;

  return (
    <section className="pm-page pm-worker-page">

      {/* Page heading */}
      <div className="pm-heading">
        <div>
          <div className="pm-eyebrow">INVENTORY</div>
          <h1>Products</h1>
          <p>View products, prices, images, and available stock.</p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="pm-alert pm-alert-error" role="alert">
          <i className="bi bi-exclamation-circle" />

          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Product summary */}
      <div className="pm-summary-row">

        <div className="pm-summary-card">
          <span>Total Products</span>
          <strong>{products.length}</strong>
        </div>

        <div className="pm-summary-card">
          <span>In Stock</span>
          <strong>{inStockCount}</strong>
        </div>

        <div className="pm-summary-card">
          <span>Out of Stock</span>
          <strong>{outOfStockCount}</strong>
        </div>

      </div>

      {/* Search and filters */}
      <div className="pm-toolbar">

        <div className="pm-search">
          <i className="bi bi-search" />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, SKU, barcode..."
            aria-label="Search products"
          />

          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>

          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.category_name || category.name}
            </option>
          ))}
        </select>

        <select
          value={brandFilter}
          onChange={(event) => setBrandFilter(event.target.value)}
          aria-label="Filter by brand"
        >
          <option value="">All Brands</option>

          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.brand_name || brand.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Archived">Archived</option>
        </select>

        <select
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value)}
          aria-label="Filter by stock"
        >
          <option value="all">All Stock</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock (1–5)</option>
          <option value="out">Out of Stock</option>
        </select>

      </div>

      {/* Product results */}
      <div className="pm-results-heading">
        <h2>Product List</h2>
        <span>{filteredProducts.length} product(s)</span>
      </div>

      {loading ? (
        <div className="pm-empty">
          <span className="pm-spinner" />
          <p>Loading products...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="pm-empty">
          <i className="bi bi-box-seam" />

          <h3>
            {products.length
              ? "No matching products"
              : "No products available"}
          </h3>

          <p>
            {products.length
              ? "Try changing your search or filters."
              : "Products will appear here when they are available."}
          </p>
        </div>
      ) : (
        <div className="pm-product-grid">

          {filteredProducts.map((product) => {
            const images = getProductImages(product);

            const quantity = Number(product.quantity || 0);

            const sellingPrice = Number(
              product.selling_price || 0
            );

            const discountPrice =
              product.discount_price == null ||
              product.discount_price === ""
                ? null
                : Number(product.discount_price);

            return (
              <article
                className="pm-product-card"
                key={product.id}
              >

                {/* Product image; click to zoom */}
                <div className="pm-card-image-wrap">

                  {images.length > 0 ? (
                    <button
                      type="button"
                      className="pm-card-image-button"
                      onClick={() => openZoom(product)}
                      aria-label={`Zoom images for ${product.name}`}
                      title="Click to zoom and browse images"
                    >
                      <img
                        src={getImageUrl(images[0])}
                        alt={product.name}
                        loading="lazy"
                      />

                      <span className="pm-zoom-hint">
                        <i className="bi bi-zoom-in" /> Zoom
                      </span>

                      {images.length > 1 && (
                        <span className="pm-image-count">
                          <i className="bi bi-images" /> {images.length}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="pm-no-image">
                      <i className="bi bi-image" />
                      <span>No image</span>
                    </div>
                  )}

                </div>

                <div className="pm-card-body">

                  {/* Product name and status */}
                  <div className="pm-card-title-row">
                    <h3 title={product.name}>
                      {product.name}
                    </h3>

                    <span
                      className={`pm-status status-${String(
                        product.status || "Active"
                      ).toLowerCase()}`}
                    >
                      {product.status || "Active"}
                    </span>
                  </div>

                  {/* Available quantity and selling price */}
                  <div className="pm-card-info">

                    <div>
                      <span>Available</span>

                      <strong
                        className={
                          quantity <= 5 ? "pm-low-stock" : ""
                        }
                      >
                        {quantity} {product.unit || "pieces"}
                      </strong>
                    </div>

                    <div>
                      <span>Selling Price</span>
                      <strong>ETB {money(sellingPrice)}</strong>
                    </div>

                  </div>

                  {/* Discount price with strikethrough */}
                  {discountPrice !== null &&
                    Number.isFinite(discountPrice) && (
                      <div className="pm-discount-line">
                        <span>Discount price</span>

                        <strong className="pm-discount-price">
                          ETB {money(discountPrice)}
                        </strong>
                      </div>
                    )}

                  {/* Workers cannot add, edit, delete, or upload products */}

                </div>

              </article>
            );
          })}

        </div>
      )}

      {/* Image zoom popup */}
      {zoomProduct && zoomImages.length > 0 && (
        <div
          className="pm-zoom-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomProduct.name} image viewer`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setZoomProduct(null);
            }
          }}
        >

          <div className="pm-zoom-dialog">

            <div className="pm-zoom-header">
              <div>
                <h2>{zoomProduct.name}</h2>

                <p>
                  Image {zoomIndex + 1} of {zoomImages.length}
                </p>
              </div>

              <button
                type="button"
                className="pm-zoom-close"
                onClick={() => setZoomProduct(null)}
                aria-label="Close image viewer"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="pm-zoom-main">

              {zoomImages.length > 1 && (
                <button
                  type="button"
                  className="pm-zoom-arrow"
                  onClick={() =>
                    setZoomIndex(
                      (zoomIndex - 1 + zoomImages.length) %
                        zoomImages.length
                    )
                  }
                  aria-label="Previous image"
                >
                  <i className="bi bi-chevron-left" />
                </button>
              )}

              <img
                className="pm-zoom-large-image"
                src={getImageUrl(zoomImages[zoomIndex])}
                alt={`${zoomProduct.name} image ${zoomIndex + 1}`}
              />

              {zoomImages.length > 1 && (
                <button
                  type="button"
                  className="pm-zoom-arrow"
                  onClick={() =>
                    setZoomIndex(
                      (zoomIndex + 1) % zoomImages.length
                    )
                  }
                  aria-label="Next image"
                >
                  <i className="bi bi-chevron-right" />
                </button>
              )}

            </div>

            {zoomImages.length > 1 && (
              <div className="pm-zoom-thumbnails">

                {zoomImages.map((image, index) => (
                  <button
                    type="button"
                    key={`${image}-${index}`}
                    className={`pm-zoom-thumb ${
                      zoomIndex === index ? "active" : ""
                    }`}
                    onClick={() => setZoomIndex(index)}
                    aria-label={`Show image ${index + 1}`}
                    aria-pressed={zoomIndex === index}
                  >
                    <img
                      src={getImageUrl(image)}
                      alt={`${zoomProduct.name} thumbnail ${index + 1}`}
                    />
                  </button>
                ))}

              </div>
            )}

            <p className="pm-zoom-help">
              Use the arrows to browse images or press Esc to close.
            </p>

          </div>
        </div>
      )}

    </section>
  );
}

export default WorkerProducts;
