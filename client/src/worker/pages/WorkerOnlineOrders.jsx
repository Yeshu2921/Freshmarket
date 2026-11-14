
import { useEffect, useMemo, useState } from "react";
import "./WorkerOnlineOrders.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const SERVER_BASE = API_BASE.replace(/\/api\/?$/, "");

function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

function getImageUrl(imagePath) {
  if (!imagePath || typeof imagePath !== "string") return "";

  if (
    imagePath.startsWith("http://") ||
    imagePath.startsWith("https://")
  ) {
    return imagePath;
  }

  return `${SERVER_BASE}/${imagePath.replace(/^\/+/, "")}`;
}

// Get every selected image for an order item.
// Supports both the new product_images array and old product_image.
function getOrderItemImages(item) {
  let images = [];

  if (Array.isArray(item?.product_images)) {
    images = item.product_images;
  } else if (typeof item?.product_images === "string") {
    try {
      images = JSON.parse(item.product_images);
    } catch {
      images = [];
    }
  }

  if (!Array.isArray(images)) {
    images = [];
  }

  images = [
    ...new Set(
      images.filter(
        (image) =>
          typeof image === "string" && image.trim() !== ""
      )
    ),
  ];

  // Backward compatibility with older orders.
  if (images.length === 0 && item?.product_image) {
    images = [item.product_image];
  }

  return images;
}

function formatMoney(value) {
  return `ETB ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString();
}

function getStatusClass(status) {
  switch (status) {
    case "Pending":
      return "wo-status-pending";
    case "Confirmed":
      return "wo-status-confirmed";
    case "Rejected":
      return "wo-status-rejected";
    default:
      return "wo-status-default";
  }
}

// Detect Cash on Delivery payment method.
function isCashOnDelivery(order) {
  const method =
    order?.recorded_payment_method ||
    order?.payment_method ||
    "";

  return /cash\s*on\s*delivery/i.test(String(method).trim());
}

function WorkerOnlineOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Delete rejected order loading state.
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);

  // Payment confirmation states.
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // Secure receipt preview states.
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [receiptPreviewLoading, setReceiptPreviewLoading] =
    useState(false);
  const [receiptPreviewError, setReceiptPreviewError] =
    useState("");

  // ======================================================
  // LOAD ORDERS
  // ======================================================

  async function loadOrders(isRefresh = false) {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const token = getToken();

      if (!token) {
        setError(
          "Your login session was not found. Please log in again."
        );
        return;
      }

      const response = await fetch(`${API_BASE}/worker-orders`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load orders.");
      }

      setOrders(data.orders || []);
    } catch (err) {
      console.error("Load online orders error:", err);
      setError(err.message || "Unable to load online orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  // ======================================================
  // CLEAN UP TEMPORARY RECEIPT IMAGE URL
  // ======================================================

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  // ======================================================
  // LOAD ORDER DETAILS AND SECURE RECEIPT IMAGE
  // ======================================================

  async function openOrderDetails(orderId) {
    try {
      setSelectedOrder(null);
      setShowRejectBox(false);
      setRejectReason("");
      setPaymentConfirmed(false);

      setReceiptPreviewUrl("");
      setReceiptPreviewError("");
      setReceiptPreviewLoading(false);

      setDetailsLoading(true);
      setError("");

      const token = getToken();

      if (!token) {
        throw new Error("Your login session was not found.");
      }

      const response = await fetch(
        `${API_BASE}/worker-orders/${orderId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to load order details."
        );
      }

      const order = data.order;

      // Normalize image arrays for every item.
      const normalizedOrder = {
        ...order,
        items: (order.items || []).map((item) => ({
          ...item,
          product_images: getOrderItemImages(item),
        })),
      };

      setSelectedOrder(normalizedOrder);

      // Cash on Delivery does not require a receipt.
      if (
        order.has_receipt &&
        !isCashOnDelivery(order)
      ) {
        setReceiptPreviewLoading(true);

        try {
          const receiptResponse = await fetch(
            `${API_BASE}/worker-orders/${orderId}/receipt`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (!receiptResponse.ok) {
            let message = "Unable to load payment receipt.";

            try {
              const receiptData = await receiptResponse.json();
              message = receiptData.message || message;
            } catch {
              // The server may return a non-JSON error.
            }

            throw new Error(message);
          }

          const contentType =
            receiptResponse.headers.get("content-type") || "";

          if (!contentType.startsWith("image/")) {
            throw new Error(
              "The receipt response is not a valid image."
            );
          }

          const blob = await receiptResponse.blob();
          const imageUrl = URL.createObjectURL(blob);

          setReceiptPreviewUrl(imageUrl);
        } catch (receiptError) {
          console.error("Receipt preview error:", receiptError);

          setReceiptPreviewError(
            receiptError.message ||
              "Unable to display the receipt."
          );
        } finally {
          setReceiptPreviewLoading(false);
        }
      }
    } catch (err) {
      console.error("Order details error:", err);
      setError(err.message || "Unable to load order details.");
    } finally {
      setDetailsLoading(false);
    }
  }

  // ======================================================
  // APPROVE ORDER AND PAYMENT TOGETHER
  // ======================================================

  async function approveSelectedOrder() {
    if (!selectedOrder) return;

    if (selectedOrder.order_status !== "Pending") {
      setError("Only pending orders can be approved.");
      return;
    }

    if (!paymentConfirmed) {
      setError(
        "Please confirm that the customer's payment has been received."
      );
      return;
    }

    const cashOrder = isCashOnDelivery(selectedOrder);

    if (!cashOrder && !selectedOrder.has_receipt) {
      setError(
        "This electronic payment has no uploaded receipt."
      );
      return;
    }

    const confirmationMessage = cashOrder
      ? "Have you physically received and counted the full cash payment? Confirming will approve the order and payment and decrease product stock."
      : "Have you verified the payment receipt and confirmed that the money was actually received? Confirming will approve the order and payment and decrease product stock.";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    try {
      setActionLoading(true);
      setError("");
      setSuccess("");

      const token = getToken();

      if (!token) {
        throw new Error("Your login session was not found.");
      }

      const response = await fetch(
        `${API_BASE}/worker-orders/${selectedOrder.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            paymentConfirmed: true,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to approve order and payment."
        );
      }

      setSuccess(
        data.message ||
          "Order and payment approved successfully."
      );

      setSelectedOrder(null);
      setShowRejectBox(false);
      setRejectReason("");
      setPaymentConfirmed(false);
      setReceiptPreviewUrl("");
      setReceiptPreviewError("");

      await loadOrders(true);
    } catch (err) {
      console.error("Approve order error:", err);
      setError(
        err.message || "Unable to approve this order."
      );
    } finally {
      setActionLoading(false);
    }
  }

  // ======================================================
  // REJECT ORDER
  // ======================================================

  async function rejectSelectedOrder() {
    if (!selectedOrder) return;

    const reason = rejectReason.trim();

    if (!reason) {
      setError(
        "Please enter a reason for rejecting this order."
      );
      return;
    }

    if (reason.length > 500) {
      setError(
        "The rejection reason cannot exceed 500 characters."
      );
      return;
    }

    try {
      setActionLoading(true);
      setError("");
      setSuccess("");

      const token = getToken();

      if (!token) {
        throw new Error("Your login session was not found.");
      }

      const response = await fetch(
        `${API_BASE}/worker-orders/${selectedOrder.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to reject order."
        );
      }

      setSuccess(
        data.message || "Order rejected successfully."
      );

      setSelectedOrder(null);
      setShowRejectBox(false);
      setRejectReason("");
      setPaymentConfirmed(false);
      setReceiptPreviewUrl("");
      setReceiptPreviewError("");

      await loadOrders(true);
    } catch (err) {
      console.error("Reject order error:", err);
      setError(
        err.message || "Unable to reject this order."
      );
    } finally {
      setActionLoading(false);
    }
  }

  // ======================================================
  // DELETE REJECTED ORDER
  // Only Rejected orders can be permanently deleted.
  // ======================================================

  async function deleteRejectedOrder(order) {
    if (order.order_status !== "Rejected") {
      setError("Only rejected orders can be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete order ${order.order_number}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeleteLoadingId(order.id);
      setError("");
      setSuccess("");

      const token = getToken();

      if (!token) {
        throw new Error("Your login session was not found.");
      }

      const response = await fetch(
        `${API_BASE}/worker-orders/${order.id}/rejected`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to delete rejected order."
        );
      }

      setOrders((previousOrders) =>
        previousOrders.filter(
          (item) => Number(item.id) !== Number(order.id)
        )
      );

      if (
        selectedOrder &&
        Number(selectedOrder.id) === Number(order.id)
      ) {
        setSelectedOrder(null);
        setShowRejectBox(false);
        setRejectReason("");
        setPaymentConfirmed(false);
        setReceiptPreviewUrl("");
        setReceiptPreviewError("");
      }

      setSuccess(
        data.message || "Rejected order deleted successfully."
      );
    } catch (err) {
      console.error("Delete rejected order error:", err);

      setError(
        err.message || "Unable to delete rejected order."
      );
    } finally {
      setDeleteLoadingId(null);
    }
  }

  // ======================================================
  // SEARCH AND FILTER
  // ======================================================

  const filteredOrders = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus =
        activeFilter === "All" ||
        order.order_status === activeFilter;

      const matchesSearch =
        !searchText ||
        String(order.order_number || "")
          .toLowerCase()
          .includes(searchText) ||
        String(order.customer_name || "")
          .toLowerCase()
          .includes(searchText) ||
        String(order.customer_phone || "")
          .toLowerCase()
          .includes(searchText);

      return matchesStatus && matchesSearch;
    });
  }, [orders, search, activeFilter]);

  const pendingCount = orders.filter(
    (order) => order.order_status === "Pending"
  ).length;

  const confirmedCount = orders.filter(
    (order) => order.order_status === "Confirmed"
  ).length;

  const rejectedCount = orders.filter(
    (order) => order.order_status === "Rejected"
  ).length;

  // ======================================================
  // CLOSE DETAILS MODAL
  // ======================================================

  function closeDetails() {
    if (actionLoading) return;

    setSelectedOrder(null);
    setShowRejectBox(false);
    setRejectReason("");
    setPaymentConfirmed(false);
    setReceiptPreviewUrl("");
    setReceiptPreviewError("");
  }

  // ======================================================
  // PAGE UI
  // ======================================================

  return (
    <div className="worker-online-orders">
      {/* Page heading */}
      <div className="wo-page-heading">
        <div>
          <span className="wo-heading-label">
            ORDER MANAGEMENT
          </span>
          <h2>Online Orders</h2>
          <p>
            Review customer orders and manage order approvals.
          </p>
        </div>

        <button
          type="button"
          className="wo-refresh-btn"
          onClick={() => loadOrders(true)}
          disabled={refreshing || loading}
        >
          <i className="bi bi-arrow-clockwise"></i>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="wo-alert wo-alert-error" role="alert">
          <i className="bi bi-exclamation-circle"></i>
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Close error"
          >
            &times;
          </button>
        </div>
      )}

      {success && (
        <div className="wo-alert wo-alert-success" role="status">
          <i className="bi bi-check-circle"></i>
          <span>{success}</span>

          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Close success message"
          >
            &times;
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="wo-summary-grid">
        <div className="wo-summary-card">
          <div className="wo-summary-icon wo-icon-total">
            <i className="bi bi-receipt"></i>
          </div>

          <div>
            <span>Total Recent Orders</span>
            <h3>{orders.length}</h3>
          </div>
        </div>

        <div className="wo-summary-card">
          <div className="wo-summary-icon wo-icon-pending">
            <i className="bi bi-hourglass-split"></i>
          </div>

          <div>
            <span>Pending Orders</span>
            <h3>{pendingCount}</h3>
          </div>
        </div>

        <div className="wo-summary-card">
          <div className="wo-summary-icon wo-icon-confirmed">
            <i className="bi bi-check2-circle"></i>
          </div>

          <div>
            <span>Confirmed Orders</span>
            <h3>{confirmedCount}</h3>
          </div>
        </div>

        <div className="wo-summary-card">
          <div className="wo-summary-icon wo-icon-pending">
            <i className="bi bi-x-circle"></i>
          </div>

          <div>
            <span>Rejected Orders</span>
            <h3>{rejectedCount}</h3>
          </div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="wo-toolbar">
        <div className="wo-search-box">
          <i className="bi bi-search"></i>

          <input
            type="text"
            placeholder="Search order number, customer or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>

        <div className="wo-filter-buttons">
          {["All", "Pending", "Confirmed", "Rejected"].map(
            (filter) => (
              <button
                type="button"
                key={filter}
                className={
                  activeFilter === filter ? "active" : ""
                }
                onClick={() => setActiveFilter(filter)}
              >
                {filter}

                {filter === "Pending" && (
                  <span>{pendingCount}</span>
                )}

                {filter === "Confirmed" && (
                  <span>{confirmedCount}</span>
                )}

                {filter === "Rejected" && (
                  <span>{rejectedCount}</span>
                )}
              </button>
            )
          )}
        </div>
      </div>

      {/* Orders list */}
      <div className="wo-orders-section">
        <div className="wo-section-heading">
          <div>
            <h4>Recent Orders</h4>
            <p>
              Pending, confirmed and rejected customer orders
            </p>
          </div>

          <span className="wo-result-count">
            {filteredOrders.length} orders
          </span>
        </div>

        {loading ? (
          <div className="wo-loading">
            <div
              className="spinner-border text-success"
              role="status"
            >
              <span className="visually-hidden">
                Loading...
              </span>
            </div>

            <p>Loading customer orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="wo-empty">
            <div className="wo-empty-icon">
              <i className="bi bi-inbox"></i>
            </div>

            <h5>No orders found</h5>

            <p>
              {search
                ? "Try another search term."
                : "There are currently no orders in this section."}
            </p>
          </div>
        ) : (
          <div className="wo-order-list">
            {filteredOrders.map((order) => (
              <div className="wo-order-card" key={order.id}>
                <div className="wo-order-main">
                  <div className="wo-order-number">
                    <span>ORDER NUMBER</span>
                    <strong>{order.order_number}</strong>
                  </div>

                  <div className="wo-customer-info">
                    <div className="wo-customer-avatar">
                      <i className="bi bi-person"></i>
                    </div>

                    <div>
                      <strong>
                        {order.customer_name || "Customer"}
                      </strong>

                      <span>
                        {order.customer_phone ||
                          "No phone number"}
                      </span>
                    </div>
                  </div>

                  <div className="wo-order-info">
                    <span>Order Date</span>
                    <strong>
                      {formatDate(order.created_at)}
                    </strong>
                  </div>

                  <div className="wo-order-info">
                    <span>Items</span>
                    <strong>
                      {order.total_items || 0} products
                    </strong>
                  </div>

                  <div className="wo-order-info">
                    <span>Total Amount</span>
                    <strong className="wo-order-amount">
                      {formatMoney(order.grand_total)}
                    </strong>
                  </div>

                  <div className="wo-order-status">
                    <span
                      className={getStatusClass(
                        order.order_status
                      )}
                    >
                      {order.order_status}
                    </span>
                  </div>
                </div>

                <div className="wo-order-footer">
                  <div className="wo-payment-info">
                    <i className="bi bi-credit-card"></i>

                    <span>
                      {order.payment_method ||
                        "Payment not specified"}
                    </span>

                    {order.has_receipt ? (
                      <span className="wo-receipt-label">
                        <i className="bi bi-file-earmark-check"></i>
                        Receipt uploaded
                      </span>
                    ) : null}
                  </div>

                  <div className="wo-order-actions">
                    <button
                      type="button"
                      className="wo-details-btn"
                      onClick={() =>
                        openOrderDetails(order.id)
                      }
                    >
                      View Details
                      <i className="bi bi-arrow-right"></i>
                    </button>

                    {order.order_status === "Rejected" && (
                      <button
                        type="button"
                        className="wo-delete-icon-btn"
                        onClick={() =>
                          deleteRejectedOrder(order)
                        }
                        disabled={
                          deleteLoadingId === order.id
                        }
                        title="Permanently delete rejected order"
                        aria-label={`Delete rejected order ${order.order_number}`}
                      >
                        {deleteLoadingId === order.id ? (
                          <span className="spinner-border spinner-border-sm"></span>
                        ) : (
                          <i className="bi bi-trash3"></i>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================================================
          ORDER DETAILS MODAL
      ================================================== */}

      {(selectedOrder || detailsLoading) && (
        <div
          className="wo-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeDetails();
            }
          }}
        >
          <div
            className="wo-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wo-details-title"
          >
            <div className="wo-modal-header">
              <div>
                <span>ORDER INFORMATION</span>

                <h3 id="wo-details-title">
                  {selectedOrder
                    ? selectedOrder.order_number
                    : "Loading order..."}
                </h3>
              </div>

              <button
                type="button"
                className="wo-modal-close"
                onClick={closeDetails}
                disabled={actionLoading}
                aria-label="Close details"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            {detailsLoading ? (
              <div className="wo-loading wo-modal-loading">
                <div
                  className="spinner-border text-success"
                  role="status"
                >
                  <span className="visually-hidden">
                    Loading...
                  </span>
                </div>

                <p>Loading order details...</p>
              </div>
            ) : selectedOrder ? (
              <>
                <div className="wo-modal-body">
                  {/* Status */}
                  <div className="wo-detail-status-row">
                    <span>Order Status</span>

                    <span
                      className={getStatusClass(
                        selectedOrder.order_status
                      )}
                    >
                      {selectedOrder.order_status}
                    </span>
                  </div>

                  {/* Customer details */}
                  <div className="wo-detail-section">
                    <h5>
                      <i className="bi bi-person-lines-fill"></i>
                      Customer Information
                    </h5>

                    <div className="wo-detail-grid">
                      <div>
                        <span>Customer Name</span>
                        <strong>
                          {selectedOrder.customer_name ||
                            "Not available"}
                        </strong>
                      </div>

                      <div>
                        <span>Phone Number</span>
                        <strong>
                          {selectedOrder.customer_phone ||
                            "Not available"}
                        </strong>
                      </div>

                      <div className="wo-full-width">
                        <span>Delivery Location</span>
                        <strong>
                          {selectedOrder.delivery_location ||
                            "Not provided"}
                        </strong>
                      </div>

                      <div>
                        <span>Order Date</span>
                        <strong>
                          {formatDate(selectedOrder.created_at)}
                        </strong>
                      </div>

                      <div>
                        <span>Payment Method</span>
                        <strong>
                          {selectedOrder.payment_method ||
                            "Not specified"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Ordered products */}
                  <div className="wo-detail-section">
                    <h5>
                      <i className="bi bi-basket2"></i>
                      Ordered Products
                    </h5>

                    <div className="wo-detail-items">
                      {(selectedOrder.items || []).map(
                        (item) => {
                          const productImages =
                            getOrderItemImages(item);

                          return (
                            <div
                              className="wo-detail-item"
                              key={item.id}
                            >
                              {/* ALL SELECTED PRODUCT IMAGES */}
                              <div className="wo-item-images">
                                {productImages.length > 0 ? (
                                  productImages.map(
                                    (image, imageIndex) => (
                                      <div
                                        className="wo-item-image"
                                        key={`${item.id}-${imageIndex}`}
                                      >
                                        <img
                                          src={getImageUrl(image)}
                                          alt={`${item.product_name} image ${imageIndex + 1}`}
                                          loading="lazy"
                                        />
                                      </div>
                                    )
                                  )
                                ) : (
                                  <div className="wo-item-image wo-no-product-image">
                                    <i className="bi bi-image"></i>
                                  </div>
                                )}
                              </div>

                              <div className="wo-item-description">
                                <strong>
                                  {item.product_name}
                                </strong>

                                <span>
                                  {formatMoney(item.unit_price)} ×{" "}
                                  {item.quantity}
                                </span>

                                <small className="wo-image-count">
                                  <i className="bi bi-images"></i>
                                  {productImages.length} selected{" "}
                                  {productImages.length === 1
                                    ? "image"
                                    : "images"}
                                </small>
                              </div>

                              <strong className="wo-item-total">
                                {formatMoney(item.line_total)}
                              </strong>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {/* Payment details */}
                  <div className="wo-detail-section">
                    <h5>
                      <i className="bi bi-wallet2"></i>
                      Payment Information
                    </h5>

                    <div className="wo-detail-grid">
                      <div>
                        <span>Payment Method</span>
                        <strong>
                          {selectedOrder.payment_method ||
                            "Not specified"}
                        </strong>
                      </div>

                      <div>
                        <span>Payment Status</span>
                        <strong>
                          {selectedOrder.payment_status ||
                            "Pending"}
                        </strong>
                      </div>

                      <div>
                        <span>Transaction Reference</span>
                        <strong>
                          {selectedOrder.transaction_reference ||
                            "Not provided"}
                        </strong>
                      </div>
                    </div>

                    {isCashOnDelivery(selectedOrder) ? (
                      <div className="wo-payment-confirmation wo-cash-payment">
                        <i className="bi bi-cash-coin"></i>

                        <div>
                          <strong>Cash on Delivery</strong>

                          <p>
                            The customer will pay in cash.
                            Receive and count the full amount
                            before approving this order.
                          </p>
                        </div>
                      </div>
                    ) : selectedOrder.has_receipt ? (
                      <div className="wo-receipt-area">
                        <div className="wo-receipt-notice">
                          <i className="bi bi-file-earmark-check"></i>

                          <div>
                            <strong>
                              Payment receipt uploaded
                            </strong>

                            <p>
                              Verify the receipt and confirm
                              that the payment was actually
                              received.
                            </p>
                          </div>
                        </div>

                        {receiptPreviewLoading && (
                          <div className="wo-receipt-loading">
                            <span className="spinner-border spinner-border-sm"></span>

                            <span>
                              Loading payment receipt...
                            </span>
                          </div>
                        )}

                        {receiptPreviewError && (
                          <div
                            className="wo-receipt-error"
                            role="alert"
                          >
                            <i className="bi bi-exclamation-circle"></i>
                            {receiptPreviewError}
                          </div>
                        )}

                        {receiptPreviewUrl && (
                          <div className="wo-receipt-preview">
                            <p>Payment Receipt Preview</p>

                            <a
                              href={receiptPreviewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={receiptPreviewUrl}
                                alt="Customer payment receipt"
                              />
                            </a>

                            <a
                              className="wo-receipt-open-link"
                              href={receiptPreviewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <i className="bi bi-box-arrow-up-right"></i>
                              Open full receipt
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="wo-no-receipt">
                        <i className="bi bi-exclamation-circle"></i>

                        No payment receipt was uploaded.
                        Electronic payment approval is unavailable.
                      </div>
                    )}

                    {/* Worker payment confirmation */}
                    {selectedOrder.order_status === "Pending" && (
                      <div className="wo-payment-confirmation">
                        <label>
                          <input
                            type="checkbox"
                            checked={paymentConfirmed}
                            onChange={(e) => {
                              setPaymentConfirmed(
                                e.target.checked
                              );
                              setError("");
                            }}
                            disabled={
                              actionLoading ||
                              (!isCashOnDelivery(selectedOrder) &&
                                (!selectedOrder.has_receipt ||
                                  !receiptPreviewUrl))
                            }
                          />

                          <span>
                            {isCashOnDelivery(selectedOrder)
                              ? "I confirm that I physically received and counted the full cash payment."
                              : "I confirm that I verified the receipt and the electronic payment was actually received."}
                          </span>
                        </label>

                        <small>
                          The order and payment will be approved
                          together. Product stock will also be
                          decreased.
                        </small>
                      </div>
                    )}
                  </div>

                  {/* Order totals */}
                  <div className="wo-total-section">
                    <div>
                      <span>Subtotal</span>

                      <strong>
                        {formatMoney(selectedOrder.subtotal)}
                      </strong>
                    </div>

                    <div>
                      <span>Delivery Fee</span>

                      <strong>
                        {formatMoney(selectedOrder.delivery_fee)}
                      </strong>
                    </div>

                    <div className="wo-grand-total">
                      <span>Grand Total</span>

                      <strong>
                        {formatMoney(selectedOrder.grand_total)}
                      </strong>
                    </div>
                  </div>

                  {/* Review history */}
                  {selectedOrder.reviews?.length > 0 && (
                    <div className="wo-detail-section">
                      <h5>
                        <i className="bi bi-clock-history"></i>
                        Order Review History
                      </h5>

                      <div className="wo-review-list">
                        {selectedOrder.reviews.map(
                          (review) => (
                            <div
                              className="wo-review-item"
                              key={review.id}
                            >
                              <div>
                                <strong>
                                  {review.action}
                                </strong>

                                <span>
                                  Handled by:{" "}
                                  {review.handled_by || "Worker"}
                                </span>

                                {review.reason && (
                                  <p>
                                    Reason: {review.reason}
                                  </p>
                                )}
                              </div>

                              <small>
                                {formatDate(review.created_at)}
                              </small>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reject reason input */}
                  {showRejectBox &&
                    selectedOrder.order_status === "Pending" && (
                      <div className="wo-reject-box">
                        <label htmlFor="wo-reject-reason">
                          Reason for rejection *
                        </label>

                        <textarea
                          id="wo-reject-reason"
                          rows="3"
                          maxLength="500"
                          placeholder="Explain why this order cannot be accepted..."
                          value={rejectReason}
                          onChange={(e) =>
                            setRejectReason(e.target.value)
                          }
                        ></textarea>

                        <small>
                          {rejectReason.length}/500 characters
                        </small>
                      </div>
                    )}
                </div>

                {/* Modal actions */}
                <div className="wo-modal-actions">
                  {selectedOrder.order_status === "Pending" ? (
                    <>
                      {!showRejectBox ? (
                        <>
                          <button
                            type="button"
                            className="wo-reject-btn"
                            onClick={() => {
                              setShowRejectBox(true);
                              setError("");
                            }}
                            disabled={actionLoading}
                          >
                            <i className="bi bi-x-circle"></i>
                            Reject Order
                          </button>

                          <button
                            type="button"
                            className="wo-approve-btn"
                            onClick={approveSelectedOrder}
                            disabled={
                              actionLoading ||
                              !paymentConfirmed ||
                              (!isCashOnDelivery(selectedOrder) &&
                                (!selectedOrder.has_receipt ||
                                  !receiptPreviewUrl)) ||
                              receiptPreviewLoading
                            }
                          >
                            {actionLoading ? (
                              <>
                                <span className="spinner-border spinner-border-sm"></span>
                                Processing...
                              </>
                            ) : (
                              <>
                                <i className="bi bi-check-circle"></i>
                                Approve Order & Payment
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="wo-cancel-btn"
                            onClick={() => {
                              setShowRejectBox(false);
                              setRejectReason("");
                              setError("");
                            }}
                            disabled={actionLoading}
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="wo-reject-btn"
                            onClick={rejectSelectedOrder}
                            disabled={actionLoading}
                          >
                            {actionLoading
                              ? "Processing..."
                              : "Confirm Rejection"}
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="wo-cancel-btn"
                      onClick={closeDetails}
                    >
                      Close
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkerOnlineOrders;
