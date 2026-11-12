
import { useEffect, useMemo, useRef, useState } from "react";
import "./ProductManagement.css";

const API =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const IMAGE_BASE = API.replace(/\/api\/?$/, "");

const emptyForm = {
  name: "",
  description: "",
  sku: "",
  barcode: "",
  category_id: "",
  brand_id: "",
  quantity: "0",
  selling_price: "",
  discount_price: "",
  unit: "pieces",
  status: "Active",
};

function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

function getImageUrl(path) {
  if (!path) return "";
  if (/^(https?:\/\/|data:|blob:)/i.test(path)) return path;

  return `${IMAGE_BASE}/${String(path).replace(/^\/+/, "")}`;
}

function getProductImages(product) {
  const images = Array.isArray(product.images)
    ? product.images
        .map((image) =>
          typeof image === "string"
            ? image
            : image.image_path || image.image_url || image.url
        )
        .filter(Boolean)
    : [];

  if (images.length) return images;

  return product.image_path ? [product.image_path] : [];
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ProductManagement() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [newImages, setNewImages] = useState([]);
  const [newImagePreviews, setNewImagePreviews] = useState([]);
  const [removedImages, setRemovedImages] = useState([]);
  const fileInputRef = useRef(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const [zoomProduct, setZoomProduct] = useState(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function request(path, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };

    if (token) headers.Authorization = `Bearer ${token}`;

    if (!(options.body instanceof FormData) && options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        result?.message ||
          result?.error ||
          "The request could not be completed."
      );
    }

    return result;
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [productResult, categoryResult, brandResult] = await Promise.all([
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
      setError(
        `${err.message} Check that your backend is running and its API routes match this page.`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    return () => {
      newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newImagePreviews]);

  useEffect(() => {
    if (!zoomProduct && !deleteTarget) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setZoomProduct(null);
        setDeleteTarget(null);
      }

      if (zoomProduct && event.key === "ArrowRight") {
        const images = getProductImages(zoomProduct);
        if (images.length) {
          setZoomIndex((index) => (index + 1) % images.length);
        }
      }

      if (zoomProduct && event.key === "ArrowLeft") {
        const images = getProductImages(zoomProduct);
        if (images.length) {
          setZoomIndex(
            (index) => (index - 1 + images.length) % images.length
          );
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomProduct, deleteTarget]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        [product.name, product.sku, product.barcode, product.description].some(
          (value) => String(value || "").toLowerCase().includes(term)
        );

      const matchesCategory =
        !categoryFilter ||
        String(product.category_id || "") === categoryFilter;

      const matchesBrand =
        !brandFilter || String(product.brand_id || "") === brandFilter;

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

  function clearImagePreviews() {
    newImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setNewImagePreviews([]);
    setNewImages([]);
  }

  function startAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setRemovedImages([]);
    clearImagePreviews();
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function startEdit(product) {
    setEditingId(product.id);

    setForm({
      ...emptyForm,
      ...product,
      name: product.name || "",
      description: product.description || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      category_id:
        product.category_id == null ? "" : String(product.category_id),
      brand_id:
        product.brand_id == null ? "" : String(product.brand_id),
      quantity: String(product.quantity ?? 0),
      selling_price: String(product.selling_price ?? ""),
      discount_price:
        product.discount_price == null
          ? ""
          : String(product.discount_price),
      unit: product.unit || "pieces",
      status: product.status || "Active",
    });

    setRemovedImages([]);
    clearImagePreviews();
    setError("");
    setNotice("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setRemovedImages([]);
    clearImagePreviews();
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function handleImageSelection(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const validFiles = [];
    const problems = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        problems.push(`${file.name}: use JPG, PNG, or WEBP.`);
      } else if (file.size > 5 * 1024 * 1024) {
        problems.push(`${file.name}: maximum size is 5 MB.`);
      } else {
        validFiles.push(file);
      }
    }

    if (problems.length) setError(problems.join(" "));
    else setError("");

    const combined = [...newImages, ...validFiles];

    if (combined.length > 10) {
      setError("You can select up to 10 new images at a time.");
      return;
    }

    setNewImages(combined);
    setNewImagePreviews((previous) => [
      ...previous,
      ...validFiles.map((file) => URL.createObjectURL(file)),
    ]);
  }

  function removeNewImage(index) {
    const url = newImagePreviews[index];
    if (url) URL.revokeObjectURL(url);

    setNewImages((previous) => previous.filter((_, i) => i !== index));
    setNewImagePreviews((previous) =>
      previous.filter((_, i) => i !== index)
    );
  }

  // Existing-image deletion uses product_images.id, not the image path.
  function toggleRemoveExistingImage(image) {
    const imageId = Number(image?.id);

    if (!Number.isInteger(imageId) || imageId <= 0) {
      console.error("Existing image is missing its database ID:", image);
      setError(
        "This image has no database ID. Refresh the product list and try again."
      );
      return;
    }

    setRemovedImages((previous) =>
      previous.includes(imageId)
        ? previous.filter((id) => id !== imageId)
        : [...previous, imageId]
    );

    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!form.name.trim()) {
      setError("Product name is required.");
      return;
    }

    if (!form.category_id) {
      setError("Please select a category.");
      return;
    }

    if (
      form.selling_price === "" ||
      !Number.isFinite(Number(form.selling_price)) ||
      Number(form.selling_price) < 0
    ) {
      setError("Enter a valid selling price.");
      return;
    }

    if (
      form.quantity === "" ||
      !Number.isInteger(Number(form.quantity)) ||
      Number(form.quantity) < 0
    ) {
      setError("Quantity must be a whole number of zero or more.");
      return;
    }

    if (
      form.discount_price !== "" &&
      (!Number.isFinite(Number(form.discount_price)) ||
        Number(form.discount_price) < 0 ||
        Number(form.discount_price) > Number(form.selling_price))
    ) {
      setError("Discount price must be zero or less than the selling price.");
      return;
    }

    setSaving(true);

    try {
      const body = new FormData();

      Object.entries(form).forEach(([key, value]) => {
        body.append(key, value);
      });

      newImages.forEach((file) => body.append("images", file));
      body.append("removed_images", JSON.stringify(removedImages));

      const path = editingId ? `/products/${editingId}` : "/products";

      const result = await request(path, {
        method: editingId ? "PUT" : "POST",
        body,
      });

      setNotice(result.message || "Product saved successfully.");
      closeForm();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setError("");
    setNotice("");

    try {
      const result = await request(`/products/${deleteTarget.id}`, {
        method: "DELETE",
      });

      setNotice(result.message || "Product deleted successfully.");
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  }

  function openZoom(product, index = 0) {
    const images = getProductImages(product);
    if (!images.length) return;

    setZoomProduct(product);
    setZoomIndex(index);
  }

  const currentZoomImages = zoomProduct
    ? getProductImages(zoomProduct)
    : [];

  const categoryName = (product) =>
    categories.find(
      (item) => String(item.id) === String(product.category_id)
    )?.category_name ||
    categories.find(
      (item) => String(item.id) === String(product.category_id)
    )?.name ||
    "Uncategorized";

  const brandName = (product) =>
    brands.find(
      (item) => String(item.id) === String(product.brand_id)
    )?.brand_name ||
    brands.find(
      (item) => String(item.id) === String(product.brand_id)
    )?.name ||
    "No brand";

  return (
    <section className="pm-page">
      <div className="pm-heading">
        <div>
          <div className="pm-eyebrow">INVENTORY CONTROL</div>
          <h1>Product Management</h1>
          <p>Manage products, prices, images, and available stock.</p>
        </div>

        {!showForm && (
          <button className="pm-primary-btn" onClick={startAdd}>
            <i className="bi bi-plus-lg" /> Add Product
          </button>
        )}
      </div>

      {error && (
        <div className="pm-alert pm-alert-error" role="alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="pm-alert pm-alert-success" role="status">
          <i className="bi bi-check-circle" />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      {showForm && (
        <form className="pm-form-card" onSubmit={handleSubmit}>
          <div className="pm-form-heading">
            <div>
              <h2>{editingId ? "Edit Product" : "Add New Product"}</h2>
              <p>Enter product information and upload its images.</p>
            </div>

            <button
              type="button"
              className="pm-icon-btn"
              onClick={closeForm}
              aria-label="Close form"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          <div className="pm-form-grid">
            <label className="pm-field">
              Product Name *
              <input
                name="name"
                value={form.name}
                onChange={handleFieldChange}
                placeholder="Enter product name"
                maxLength={180}
                required
              />
            </label>

            <label className="pm-field">
              SKU
              <input
                name="sku"
                value={form.sku}
                onChange={handleFieldChange}
                placeholder="Product SKU"
                maxLength={80}
              />
            </label>

            <label className="pm-field">
              Barcode
              <input
                name="barcode"
                value={form.barcode}
                onChange={handleFieldChange}
                placeholder="Barcode number"
                maxLength={100}
              />
            </label>

            <label className="pm-field">
              Category *
              <select
                name="category_id"
                value={form.category_id}
                onChange={handleFieldChange}
                required
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category_name || category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="pm-field">
              Brand
              <select
                name="brand_id"
                value={form.brand_id}
                onChange={handleFieldChange}
              >
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.brand_name || brand.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="pm-field">
              Quantity *
              <input
                name="quantity"
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={handleFieldChange}
                required
              />
            </label>

            <label className="pm-field">
              Selling Price *
              <input
                name="selling_price"
                type="number"
                min="0"
                step="0.01"
                value={form.selling_price}
                onChange={handleFieldChange}
                placeholder="0.00"
                required
              />
            </label>

            <label className="pm-field">
              Discount Price
              <input
                name="discount_price"
                type="number"
                min="0"
                step="0.01"
                value={form.discount_price}
                onChange={handleFieldChange}
                placeholder="Optional"
              />
            </label>

            <label className="pm-field">
              Unit
              <select
                name="unit"
                value={form.unit}
                onChange={handleFieldChange}
              >
                {["pieces", "kg", "g", "litre", "ml", "box", "pack", "bottle"].map(
                  (unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="pm-field">
              Status
              <select
                name="status"
                value={form.status}
                onChange={handleFieldChange}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Archived">Archived</option>
              </select>
            </label>

            <label className="pm-field pm-field-wide">
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={handleFieldChange}
                placeholder="Describe the product..."
                rows="3"
              />
            </label>
          </div>

          {editingId &&
            (() => {
              const product = products.find(
                (item) => String(item.id) === String(editingId)
              );

              // Keep the original image objects so their database IDs remain available.
              const existingImages = Array.isArray(product?.images)
                ? product.images.filter(
                    (image) =>
                      image &&
                      typeof image === "object" &&
                      image.id != null
                  )
                : [];

              return existingImages.length > 0 ? (
                <div className="pm-upload-section">
                  <h3>Existing images</h3>
                  <div className="pm-upload-grid">
                    {existingImages.map((image) => {
                      const imageId = Number(image.id);
                      const path =
                        image.image_path ||
                        image.image_url ||
                        image.url;

                      const removed = removedImages.includes(imageId);

                      return (
                        <div
                          className={`pm-upload-preview ${
                            removed ? "is-removed" : ""
                          }`}
                          key={imageId}
                        >
                          <img
                            src={getImageUrl(path)}
                            alt={`Product image ${imageId}`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              toggleRemoveExistingImage(image)
                            }
                            title={removed ? "Keep image" : "Remove image"}
                          >
                            <i
                              className={
                                removed
                                  ? "bi bi-arrow-counterclockwise"
                                  : "bi bi-trash"
                              }
                            />
                          </button>
                          {removed && <span>Will remove</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="pm-upload-section">
                  <h3>Existing images</h3>
                  <p>
                    No image records with database IDs were returned for this
                    product. Check the products API response.
                  </p>
                </div>
              );
            })()}

          <div className="pm-upload-section">
            <h3>Product images</h3>
            <p>
              Choose JPG, PNG, or WEBP images, up to 5 MB each. Maximum 10 new
              images.
            </p>

            <button
              type="button"
              className="pm-upload-button"
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="bi bi-cloud-arrow-up" />
              Choose Images
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={handleImageSelection}
            />

            {newImagePreviews.length > 0 && (
              <div className="pm-upload-grid">
                {newImagePreviews.map((preview, index) => (
                  <div className="pm-upload-preview" key={preview}>
                    <img
                      src={preview}
                      alt={`New product ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(index)}
                      title="Remove selected image"
                    >
                      <i className="bi bi-x-lg" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pm-form-actions">
            <button
              type="button"
              className="pm-secondary-btn"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pm-primary-btn"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Save Product"}
            </button>
          </div>
        </form>
      )}

      <div className="pm-summary-row">
        <div className="pm-summary-card">
          <span>Total Products</span>
          <strong>{products.length}</strong>
        </div>
        <div className="pm-summary-card">
          <span>In Stock</span>
          <strong>
            {products.filter((item) => Number(item.quantity) > 0).length}
          </strong>
        </div>
        <div className="pm-summary-card">
          <span>Out of Stock</span>
          <strong>
            {products.filter((item) => Number(item.quantity) <= 0).length}
          </strong>
        </div>
      </div>

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
            <button onClick={() => setSearch("")} aria-label="Clear search">
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
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.category_name || item.name}
            </option>
          ))}
        </select>

        <select
          value={brandFilter}
          onChange={(event) => setBrandFilter(event.target.value)}
          aria-label="Filter by brand"
        >
          <option value="">All Brands</option>
          {brands.map((item) => (
            <option key={item.id} value={item.id}>
              {item.brand_name || item.name}
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

      <div className="pm-results-heading">
        <h2>Products</h2>
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
            {products.length ? "No matching products" : "No products yet"}
          </h3>
          <p>
            {products.length
              ? "Try changing your search or filters."
              : "Select Add Product to create your first product."}
          </p>
          {!products.length && !showForm && (
            <button className="pm-primary-btn" onClick={startAdd}>
              <i className="bi bi-plus-lg" /> Add Product
            </button>
          )}
        </div>
      ) : (
        <div className="pm-product-grid">
          {filteredProducts.map((product) => {
            const images = getProductImages(product);
            const quantity = Number(product.quantity || 0);
            const sellingPrice = Number(product.selling_price || 0);

            const discountPrice =
              product.discount_price === null ||
              product.discount_price === undefined ||
              product.discount_price === ""
                ? null
                : Number(product.discount_price);

            return (
              <article className="pm-product-card" key={product.id}>
                <div className="pm-card-image-wrap">
                  {images.length ? (
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
                  <div className="pm-card-title-row">
                    <h3 title={product.name}>{product.name}</h3>
                    <span
                      className={`pm-status status-${String(
                        product.status || "Active"
                      ).toLowerCase()}`}
                    >
                      {product.status || "Active"}
                    </span>
                  </div>

                  <p className="pm-card-description">
                    {product.description || "No description provided."}
                  </p>

                  <div className="pm-card-tags">
                    <span>{categoryName(product)}</span>
                    <span>{brandName(product)}</span>
                  </div>

                  <div className="pm-card-info">
                    <div>
                      <span>Available</span>
                      <strong className={quantity <= 5 ? "pm-low-stock" : ""}>
                        {quantity} {product.unit || "pieces"}
                      </strong>
                    </div>
                    <div>
                      <span>Selling Price</span>
                      <strong>ETB {money(sellingPrice)}</strong>
                    </div>
                  </div>

                  {discountPrice !== null && (
                    <div className="pm-discount-line">
                      <span>Discount price</span>
                      <strong>ETB {money(discountPrice)}</strong>
                    </div>
                  )}

                  <div className="pm-card-actions">
                    <button
                      type="button"
                      className="pm-edit-btn"
                      onClick={() => startEdit(product)}
                    >
                      <i className="bi bi-pencil-square" /> Edit
                    </button>
                    <button
                      type="button"
                      className="pm-delete-btn"
                      onClick={() => setDeleteTarget(product)}
                    >
                      <i className="bi bi-trash" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {zoomProduct && currentZoomImages.length > 0 && (
        <div
          className="pm-zoom-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomProduct.name} image viewer`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setZoomProduct(null);
          }}
        >
          <div className="pm-zoom-dialog">
            <div className="pm-zoom-header">
              <div>
                <h2>{zoomProduct.name}</h2>
                <p>
                  Image {zoomIndex + 1} of {currentZoomImages.length}
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
              {currentZoomImages.length > 1 && (
                <button
                  type="button"
                  className="pm-zoom-arrow"
                  onClick={() =>
                    setZoomIndex(
                      (zoomIndex - 1 + currentZoomImages.length) %
                        currentZoomImages.length
                    )
                  }
                  aria-label="Previous image"
                >
                  <i className="bi bi-chevron-left" />
                </button>
              )}

              <img
                className="pm-zoom-large-image"
                src={getImageUrl(currentZoomImages[zoomIndex])}
                alt={`${zoomProduct.name} image ${zoomIndex + 1}`}
              />

              {currentZoomImages.length > 1 && (
                <button
                  type="button"
                  className="pm-zoom-arrow"
                  onClick={() =>
                    setZoomIndex((zoomIndex + 1) % currentZoomImages.length)
                  }
                  aria-label="Next image"
                >
                  <i className="bi bi-chevron-right" />
                </button>
              )}
            </div>

            <div className="pm-zoom-thumbnails">
              {currentZoomImages.map((image, index) => (
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

            <p className="pm-zoom-help">
              Click a thumbnail to change the large image. Press Esc to close.
            </p>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="pm-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pm-delete-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="pm-confirm-dialog">
            <div className="pm-confirm-icon">
              <i className="bi bi-trash" />
            </div>
            <h2 id="pm-delete-title">Delete product?</h2>
            <p>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.name}</strong>? This action may not be
              reversible.
            </p>
            <div className="pm-form-actions">
              <button
                className="pm-secondary-btn"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button className="pm-delete-btn" onClick={confirmDelete}>
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ProductManagement;
