
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./ProductSidebar.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

function getRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.categories)) return data.categories;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function categoryId(category) {
  return String(category.id ?? category.category_id ?? "");
}

function parentId(category) {
  const value =
    category.parent_id ??
    category.parent_category_id ??
    category.parentCategoryId ??
    "";

  return value == null ? "" : String(value);
}

function categoryName(category) {
  return category.name || category.category_name || "Category";
}

export default function ProductSidebar({ onNavigate = () => {} }) {
  const [searchParams] = useSearchParams();

  const selectedMain = searchParams.get("mainCategory") || "";
  const selectedSub = searchParams.get("subcategory") || "";

  const [categories, setCategories] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API}/categories/public`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Could not load categories.");
        }

        const data = await response.json();
        const rows = getRows(data);

        setCategories(rows);

        const selectedCategory = rows.find(
          (category) => categoryId(category) === selectedSub
        );

        const mainToExpand =
          selectedMain ||
          (selectedCategory ? parentId(selectedCategory) : "");

        if (mainToExpand) {
          setExpanded((previous) => ({
            ...previous,
            [mainToExpand]: true,
          }));
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load categories.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadCategories();

    return () => controller.abort();
  }, [selectedMain, selectedSub]);

  const mainCategories = categories.filter(
    (category) => !parentId(category)
  );

  function toggleCategory(id) {
    setExpanded((previous) => ({
      ...previous,
      [id]: !previous[id],
    }));
  }

  return (
    <aside className="product-sidebar">
      <div className="product-sidebar-heading">
        <span className="product-sidebar-heading-icon" aria-hidden="true">
          ☰
        </span>
        <h2>Shop Categories</h2>
      </div>

      {/* All Products */}
      <Link
        to="/market"
        onClick={onNavigate}
        className={`product-sidebar-all ${
          !selectedMain && !selectedSub ? "active" : ""
        }`}
      >
        <span>All Products</span>
        <span className="product-sidebar-arrow" aria-hidden="true">
          ›
        </span>
      </Link>

      {loading && (
        <p className="product-sidebar-message">Loading categories...</p>
      )}

      {error && <p className="product-sidebar-error">{error}</p>}

      {!loading && !error && mainCategories.length === 0 && (
        <p className="product-sidebar-message">
          No categories available.
        </p>
      )}

      {!loading &&
        !error &&
        mainCategories.map((main) => {
          const mainId = categoryId(main);

          const subcategories = categories.filter(
            (category) => parentId(category) === mainId
          );

          const isExpanded = Boolean(expanded[mainId]);

          const isMainSelected =
            selectedMain === mainId && !selectedSub;

          const containsSelectedSub = subcategories.some(
            (subcategory) => categoryId(subcategory) === selectedSub
          );

          return (
            <div className="product-sidebar-group" key={mainId}>
              <div
                className={`product-sidebar-main-row ${
                  isMainSelected || containsSelectedSub ? "selected" : ""
                }`}
              >
                {/* Main category */}
                <Link
                  to={`/market?mainCategory=${encodeURIComponent(mainId)}`}
                  onClick={onNavigate}
                  className="product-sidebar-main-link"
                >
                  {categoryName(main)}
                </Link>

                {/* Expand / Collapse */}
                {subcategories.length > 0 && (
                  <button
                    type="button"
                    className="product-sidebar-toggle"
                    aria-label={
                      isExpanded
                        ? `Collapse ${categoryName(main)}`
                        : `Expand ${categoryName(main)}`
                    }
                    aria-expanded={isExpanded}
                    onClick={() => toggleCategory(mainId)}
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                )}
              </div>

              {/* Subcategories */}
              {isExpanded && subcategories.length > 0 && (
                <div className="product-sidebar-subcategories">
                  {subcategories.map((subcategory) => {
                    const subId = categoryId(subcategory);
                    const isSelected = selectedSub === subId;

                    return (
                      <Link
                        key={subId}
                        to={`/market?mainCategory=${encodeURIComponent(
                          mainId
                        )}&subcategory=${encodeURIComponent(subId)}`}
                        onClick={onNavigate}
                        className={`product-sidebar-sub-link ${
                          isSelected ? "active" : ""
                        }`}
                      >
                        <span
                          className="product-sidebar-sub-dot"
                          aria-hidden="true"
                        />
                        <span>{categoryName(subcategory)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </aside>
  );
}
