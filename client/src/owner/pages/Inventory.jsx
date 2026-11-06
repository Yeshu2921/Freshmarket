
import { useEffect, useMemo, useState } from "react";
import "./Inventory.css";

const API = "http://localhost:5134/api";
const IMAGE_BASE = "http://localhost:5134";

function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

function getImageUrl(path) {
  if (!path) return "";

  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  return `${IMAGE_BASE}/${String(path).replace(/^\/+/, "")}`;
}

function getProductImage(product) {
  if (Array.isArray(product.images) && product.images.length > 0) {
    const firstImage = product.images[0];

    return typeof firstImage === "string"
      ? firstImage
      : firstImage?.image_path ||
          firstImage?.image_url ||
          firstImage?.url ||
          product.image_path ||
          "";
  }

  return product.image_path || "";
}

function getStockStatus(quantity) {
  if (quantity <= 0) {
    return "out";
  }

  if (quantity <= 5) {
    return "low";
  }

  return "in";
}

function Inventory() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  async function loadInventory() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/products`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const contentType = response.headers.get("content-type") || "";
      const result = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          result?.message ||
            result?.error ||
            "Unable to load inventory."
        );
      }

      const productList = Array.isArray(result)
        ? result
        : result.products || result.data || [];

      setProducts(productList);

      // Load categories to display category names.
      const categoryResponse = await fetch(`${API}/categories`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (categoryResponse.ok) {
        const categoryResult = await categoryResponse.json();

        setCategories(
          Array.isArray(categoryResult)
            ? categoryResult
            : categoryResult.categories || categoryResult.data || []
        );
      }
    } catch (err) {
      setError(err.message || "Something went wrong while loading inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const getCategoryName = (product) => {
    const category = categories.find(
      (item) =>
        String(item.id) === String(product.category_id)
    );

    return (
      category?.category_name ||
      category?.name ||
      "Uncategorized"
    );
  };

  const stockCounts = useMemo(() => {
    return products.reduce(
      (counts, product) => {
        const quantity = Number(product.quantity || 0);
        const status = getStockStatus(quantity);

        counts.total += 1;
        counts[status] += 1;

        return counts;
      },
      {
        total: 0,
        in: 0,
        low: 0,
        out: 0,
      }
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        String(product.name || "").toLowerCase().includes(term) ||
        String(product.barcode || "").toLowerCase().includes(term);

      const status = getStockStatus(
        Number(product.quantity || 0)
      );

      const matchesStock =
        stockFilter === "all" || status === stockFilter;

      return matchesSearch && matchesStock;
    });
  }, [products, search, stockFilter]);

  function getStatusLabel(quantity) {
    const status = getStockStatus(quantity);

    if (status === "out") return "Out of Stock";
    if (status === "low") return "Low Stock";

    return "In Stock";
  }

  return (
    <section className="inventory-page">
      <div className="inventory-heading">
        <div>
          <span className="inventory-eyebrow">
            STOCK CONTROL
          </span>

          <h1>Inventory</h1>

          <p>
            Monitor available product quantities and stock levels.
          </p>
        </div>

        <button
          type="button"
          className="inventory-refresh-btn"
          onClick={loadInventory}
          disabled={loading}
        >
          <i className="bi bi-arrow-clockwise" />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="inventory-alert" role="alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Close error"
          >
            ×
          </button>
        </div>
      )}

      <div className="inventory-summary">
        <article className="inventory-summary-card total">
          <div className="inventory-summary-icon">
            <i className="bi bi-box-seam" />
          </div>

          <div>
            <span>Total Products</span>
            <strong>{stockCounts.total}</strong>
          </div>
        </article>

        <article className="inventory-summary-card in-stock">
          <div className="inventory-summary-icon">
            <i className="bi bi-check-circle" />
          </div>

          <div>
            <span>In Stock</span>
            <strong>{stockCounts.in}</strong>
          </div>
        </article>

        <article className="inventory-summary-card low-stock">
          <div className="inventory-summary-icon">
            <i className="bi bi-exclamation-triangle" />
          </div>

          <div>
            <span>Low Stock</span>
            <strong>{stockCounts.low}</strong>
          </div>
        </article>

        <article className="inventory-summary-card out-stock">
          <div className="inventory-summary-icon">
            <i className="bi bi-x-circle" />
          </div>

          <div>
            <span>Out of Stock</span>
            <strong>{stockCounts.out}</strong>
          </div>
        </article>
      </div>

      <div className="inventory-toolbar">
        <div className="inventory-search">
          <i className="bi bi-search" />

          <input
            type="text"
            placeholder="Search product name or barcode..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value)}
          aria-label="Filter inventory by stock status"
        >
          <option value="all">All Stock Status</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      <div className="inventory-results-heading">
        <div>
          <h2>Product Stock</h2>
          <p>Current available quantities for all products.</p>
        </div>

        <span>
          {filteredProducts.length} product(s)
        </span>
      </div>

      {loading ? (
        <div className="inventory-empty">
          <span className="inventory-spinner" />
          <p>Loading inventory...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="inventory-empty">
          <i className="bi bi-box-seam" />

          <h3>
            {products.length
              ? "No matching products"
              : "No products available"}
          </h3>

          <p>
            {products.length
              ? "Try another product name, barcode, or stock filter."
              : "Add products from the Product Management page to see them here."}
          </p>
        </div>
      ) : (
        <div className="inventory-table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Barcode</th>
                <th>Available Quantity</th>
                <th>Stock Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => {
                const quantity = Number(product.quantity || 0);
                const image = getProductImage(product);

                const status = getStockStatus(quantity);

                return (
                  <tr key={product.id}>
                    <td>
                      <div className="inventory-product">
                        {image ? (
                          <img
                            src={getImageUrl(image)}
                            alt={product.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="inventory-no-image">
                            <i className="bi bi-image" />
                          </div>
                        )}

                        <div>
                          <strong>{product.name}</strong>
                          <span>
                            {product.sku || "No SKU"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>{getCategoryName(product)}</td>

                    <td>
                      {product.barcode || "—"}
                    </td>

                    <td>
                      <strong
                        className={`inventory-quantity quantity-${status}`}
                      >
                        {quantity} {product.unit || "pieces"}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={`inventory-status status-${status}`}
                      >
                        <span className="inventory-status-dot" />
                        {getStatusLabel(quantity)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="inventory-note">
        <i className="bi bi-info-circle" />

        <p>
          Inventory is a monitoring page. To add products or change
          their quantities, use <strong>Product Management</strong>
          
        </p>
      </div>
    </section>
  );
}

export default Inventory;
