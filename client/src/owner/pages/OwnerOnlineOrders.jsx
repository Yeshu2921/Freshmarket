
import { useCallback, useEffect, useMemo, useState } from "react";
import "./OwnerOnlineOrders.css";

const API_BASE = "http://localhost:5134/api";

const ORDER_STATUSES = [
  "All",
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Rejected",
];

const getToken = () => sessionStorage.getItem("freshmartToken");

const getHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

const formatMoney = (amount) => {
  const value = Number(amount || 0);

  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (date) => {
  if (!date) return "N/A";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "N/A";

  return parsedDate.toLocaleString("en-ET", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const displayStatus = (status) => {
  if (status === "Confirmed") return "Approved";
  if (status === "Delivered") return "Completed";
  return status || "Unknown";
};

const getStatusClass = (status) => {
  const classes = {
    Pending: "pending",
    Confirmed: "approved",
    Preparing: "preparing",
    Ready: "ready",
    "Out for Delivery": "delivery",
    Delivered: "completed",
    Cancelled: "cancelled",
    Rejected: "rejected",
  };

  return classes[status] || "unknown";
};

const getCustomerName = (order) =>
  order.customer_name ||
  order.full_name ||
  order.customer_full_name ||
  order.name ||
  "Unknown customer";

const getCustomerPhone = (order) =>
  order.customer_phone ||
  order.phone ||
  order.customer_mobile ||
  "Not provided";

const getPayment = (order) =>
  order.payment ||
  order.latest_payment ||
  order.payment_details ||
  null;

function OwnerOnlineOrders() {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("All");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const [deletingId, setDeletingId] = useState(null);

 const fetchOrders = useCallback(async () => {
  try {
    setLoading(true);
    setError("");

    const token = sessionStorage.getItem("freshmartToken");

    if (!token) {
      throw new Error("Authentication token not found. Please log in again.");
    }

    const response = await fetch(`${API_BASE}/owner-orders`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await response.json();

    console.log("Owner Orders Response:", data);

    if (!response.ok) {
      throw new Error(data.message || "Failed to load orders.");
    }

    setOrders(Array.isArray(data.orders) ? data.orders : []);
  } catch (error) {
    console.error("Owner Orders Error:", error);
    setError(error.message || "Failed to load orders.");
  } finally {
    setLoading(false);
  }
}, []);
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    let result = [...orders];

    if (activeStatus !== "All") {
      result = result.filter(
        (order) => order.order_status === activeStatus
      );
    }

    const searchValue = search.trim().toLowerCase();

    if (searchValue) {
      result = result.filter((order) => {
        const orderNumber = String(order.order_number || "").toLowerCase();
        const customerName = getCustomerName(order).toLowerCase();
        const customerPhone = String(getCustomerPhone(order)).toLowerCase();

        return (
          orderNumber.includes(searchValue) ||
          customerName.includes(searchValue) ||
          customerPhone.includes(searchValue)
        );
      });
    }

    setFilteredOrders(result);
  }, [orders, activeStatus, search]);

  const statistics = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((o) => o.order_status === "Pending").length,
      approved: orders.filter((o) => o.order_status === "Confirmed").length,
      completed: orders.filter((o) => o.order_status === "Delivered").length,
      rejected: orders.filter((o) => o.order_status === "Rejected").length,
    };
  }, [orders]);

  const openOrderDetails = async (order) => {
    setSelectedOrder(order);
    setDetailsLoading(true);
    setDetailsError("");

    try {
      const response = await fetch(
        `${API_BASE}/owner-orders/${order.id}`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load order details.");
      }

      const detailedOrder = data.order || data;

      setSelectedOrder({
        ...order,
        ...detailedOrder,
        items:
          detailedOrder.items ||
          detailedOrder.order_items ||
          data.items ||
          [],
        reviews:
          detailedOrder.reviews ||
          detailedOrder.order_reviews ||
          data.reviews ||
          [],
      });
    } catch (err) {
      setDetailsError(err.message || "Could not load order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const deleteOrder = async (order) => {
    const confirmed = window.confirm(
      `Permanently delete order ${order.order_number}?\n\nThis will delete the order, its items, payment records, and worker review history. This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(order.id);
      setError("");

      const response = await fetch(
        `${API_BASE}/owner-orders/${order.id}`,
        {
          method: "DELETE",
          headers: getHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete this order.");
      }

      setOrders((previous) =>
        previous.filter((item) => item.id !== order.id)
      );

      if (selectedOrder?.id === order.id) {
        setSelectedOrder(null);
      }
    } catch (err) {
      setError(err.message || "Order deletion failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const closeDetails = () => {
    setSelectedOrder(null);
    setDetailsError("");
  };

  return (
    <div className="owner-orders-page">
      {/* Page heading */}
      <div className="owner-orders-heading">
        <div>
          <span className="owner-orders-eyebrow">
            FRESHMART MANAGEMENT
          </span>
          <h2>Online Orders</h2>
          <p>
            Monitor customer orders, payment information, and worker activity.
          </p>
        </div>

        <button
          className="btn owner-orders-refresh"
          onClick={fetchOrders}
          disabled={loading}
        >
          <i className="bi bi-arrow-clockwise me-2"></i>
          {loading ? "Refreshing..." : "Refresh Orders"}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="alert alert-danger owner-orders-alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button
            className="btn-close float-end"
            onClick={() => setError("")}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Statistics */}
      <div className="owner-order-statistics">
        <div className="owner-order-stat-card">
          <div className="owner-stat-icon total-icon">
            <i className="bi bi-cart-check"></i>
          </div>
          <div>
            <span>Total Orders</span>
            <h3>{statistics.total}</h3>
          </div>
        </div>

        <div className="owner-order-stat-card">
          <div className="owner-stat-icon pending-icon">
            <i className="bi bi-clock-history"></i>
          </div>
          <div>
            <span>Pending</span>
            <h3>{statistics.pending}</h3>
          </div>
        </div>

        <div className="owner-order-stat-card">
          <div className="owner-stat-icon approved-icon">
            <i className="bi bi-check-circle"></i>
          </div>
          <div>
            <span>Approved</span>
            <h3>{statistics.approved}</h3>
          </div>
        </div>

        <div className="owner-order-stat-card">
          <div className="owner-stat-icon completed-icon">
            <i className="bi bi-bag-check"></i>
          </div>
          <div>
            <span>Completed</span>
            <h3>{statistics.completed}</h3>
          </div>
        </div>

        <div className="owner-order-stat-card">
          <div className="owner-stat-icon rejected-icon">
            <i className="bi bi-x-circle"></i>
          </div>
          <div>
            <span>Rejected</span>
            <h3>{statistics.rejected}</h3>
          </div>
        </div>
      </div>

      {/* Orders section */}
      <div className="owner-orders-content">
        <div className="owner-orders-toolbar">
          <div>
            <h5>Customer Orders</h5>
            <p>View and manage all submitted online orders.</p>
          </div>

          <div className="owner-orders-search">
            <i className="bi bi-search"></i>
            <input
              type="text"
              placeholder="Search order, customer or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <i className="bi bi-x"></i>
              </button>
            )}
          </div>
        </div>

        {/* Status filters */}
        <div className="owner-orders-filters">
          {ORDER_STATUSES.map((status) => (
            <button
              key={status}
              className={`owner-order-filter ${
                activeStatus === status ? "active" : ""
              }`}
              onClick={() => setActiveStatus(status)}
            >
              {status === "All" ? "All Orders" : displayStatus(status)}
              {status === "All" && (
                <span>{orders.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Orders table */}
        <div className="owner-orders-table-wrapper">
          {loading ? (
            <div className="owner-orders-state">
              <div className="spinner-border text-success"></div>
              <p>Loading customer orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="owner-orders-state">
              <div className="owner-orders-empty-icon">
                <i className="bi bi-inbox"></i>
              </div>
              <h5>No orders found</h5>
              <p>
                {search || activeStatus !== "All"
                  ? "Try changing your search or status filter."
                  : "Customer online orders will appear here."}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table owner-orders-table align-middle">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>CUSTOMER</th>
                    <th>PRODUCTS</th>
                    <th>TOTAL AMOUNT</th>
                    <th>PAYMENT</th>
                    <th>STATUS</th>
                    <th>ORDER DATE</th>
                    <th className="text-center">ACTIONS</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order) => {
                    const payment = getPayment(order);

                    return (
                      <tr key={order.id}>
                        <td>
                          <strong className="owner-order-number">
                            {order.order_number}
                          </strong>
                          <small className="d-block text-muted">
                            ID: {order.id}
                          </small>
                        </td>

                        <td>
                          <div className="owner-order-customer">
                            <div className="owner-customer-avatar">
                              {getCustomerName(order)
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div>
                              <strong>{getCustomerName(order)}</strong>
                              <small>{getCustomerPhone(order)}</small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="owner-order-product-count">
                            <i className="bi bi-box-seam me-1"></i>
                            {order.total_items ?? order.item_count ?? 0} items
                          </span>
                        </td>

                        <td>
                          <strong className="owner-order-amount">
                            {formatMoney(order.grand_total)}
                          </strong>
                        </td>

                        <td>
                          <span className="owner-payment-method">
                            {payment?.payment_method ||
                              order.payment_method ||
                              "N/A"}
                          </span>
                          <small className="d-block text-muted">
                            {payment?.payment_status ||
                              order.payment_status ||
                              "Not reviewed"}
                          </small>
                        </td>

                        <td>
                          <span
                            className={`owner-order-status ${getStatusClass(
                              order.order_status
                            )}`}
                          >
                            {displayStatus(order.order_status)}
                          </span>
                        </td>

                        <td className="owner-order-date">
                          {formatDate(order.created_at)}
                        </td>

                        <td>
                          <div className="owner-order-actions">
                            <button
                              className="owner-order-view-btn"
                              onClick={() => openOrderDetails(order)}
                              title="View order details"
                            >
                              <i className="bi bi-eye"></i>
                            </button>

                            <button
                              className="owner-order-delete-btn"
                              onClick={() => deleteOrder(order)}
                              disabled={deletingId === order.id}
                              title="Permanently delete order"
                            >
                              {deletingId === order.id ? (
                                <span className="spinner-border spinner-border-sm"></span>
                              ) : (
                                <i className="bi bi-trash3"></i>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && filteredOrders.length > 0 && (
          <div className="owner-orders-footer">
            Showing <strong>{filteredOrders.length}</strong> of{" "}
            <strong>{orders.length}</strong> orders
          </div>
        )}
      </div>

      {/* Order details modal */}
      {selectedOrder && (
        <div
          className="owner-order-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetails();
          }}
        >
          <div
            className="owner-order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-order-modal-title"
          >
            <div className="owner-order-modal-header">
              <div>
                <span>ORDER DETAILS</span>
                <h4 id="owner-order-modal-title">
                  {selectedOrder.order_number}
                </h4>
              </div>

              <button
                className="owner-modal-close"
                onClick={closeDetails}
                aria-label="Close details"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="owner-order-modal-body">
              {detailsLoading ? (
                <div className="owner-orders-state">
                  <div className="spinner-border text-success"></div>
                  <p>Loading order details...</p>
                </div>
              ) : (
                <>
                  {detailsError && (
                    <div className="alert alert-warning">
                      {detailsError}
                    </div>
                  )}

                  {/* Basic information */}
                  <div className="owner-detail-section">
                    <div className="owner-detail-section-heading">
                      <i className="bi bi-receipt"></i>
                      <h6>Order Information</h6>
                    </div>

                    <div className="owner-detail-grid">
                      <div>
                        <span>Order Number</span>
                        <strong>{selectedOrder.order_number}</strong>
                      </div>

                      <div>
                        <span>Order Status</span>
                        <strong>
                          <span
                            className={`owner-order-status ${getStatusClass(
                              selectedOrder.order_status
                            )}`}
                          >
                            {displayStatus(selectedOrder.order_status)}
                          </span>
                        </strong>
                      </div>

                      <div>
                        <span>Order Date</span>
                        <strong>{formatDate(selectedOrder.created_at)}</strong>
                      </div>

                      <div>
                        <span>Last Updated</span>
                        <strong>{formatDate(selectedOrder.updated_at)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Customer */}
                  <div className="owner-detail-section">
                    <div className="owner-detail-section-heading">
                      <i className="bi bi-person"></i>
                      <h6>Customer Information</h6>
                    </div>

                    <div className="owner-detail-grid">
                      <div>
                        <span>Customer Name</span>
                        <strong>{getCustomerName(selectedOrder)}</strong>
                      </div>

                      <div>
                        <span>Phone Number</span>
                        <strong>{getCustomerPhone(selectedOrder)}</strong>
                      </div>

                      <div className="owner-detail-full">
                        <span>Delivery Location</span>
                        <strong>
                          {selectedOrder.delivery_location || "Not provided"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Products */}
                  <div className="owner-detail-section">
                    <div className="owner-detail-section-heading">
                      <i className="bi bi-basket"></i>
                      <h6>Ordered Products</h6>
                    </div>

                    {(selectedOrder.items || []).length === 0 ? (
                      <p className="owner-detail-muted">
                        No product details are available.
                      </p>
                    ) : (
                      <div className="owner-detail-products">
                        {selectedOrder.items.map((item) => (
                          <div
                            className="owner-detail-product"
                            key={item.id}
                          >
                            <div className="owner-detail-product-image">
                              {item.product_image ? (
                                <img
                                  src={
                                    item.product_image.startsWith("http")
                                      ? item.product_image
                                      : `http://localhost:5134${
                                          item.product_image.startsWith("/")
                                            ? ""
                                            : "/"
                                        }${item.product_image}`
                                  }
                                  alt={item.product_name}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <i className="bi bi-image"></i>
                              )}
                            </div>

                            <div className="owner-detail-product-name">
                              <strong>{item.product_name}</strong>
                              <small>
                                {formatMoney(item.unit_price)} × {item.quantity}
                              </small>
                            </div>

                            <strong className="owner-detail-line-total">
                              {formatMoney(item.line_total)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="owner-detail-totals">
                      <div>
                        <span>Subtotal</span>
                        <strong>{formatMoney(selectedOrder.subtotal)}</strong>
                      </div>
                      <div>
                        <span>Delivery Fee</span>
                        <strong>
                          {formatMoney(selectedOrder.delivery_fee)}
                        </strong>
                      </div>
                      <div className="owner-detail-grand-total">
                        <span>Grand Total</span>
                        <strong>
                          {formatMoney(selectedOrder.grand_total)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Payment */}
                  <div className="owner-detail-section">
                    <div className="owner-detail-section-heading">
                      <i className="bi bi-credit-card"></i>
                      <h6>Payment Information</h6>
                    </div>

                    {(() => {
                      const payment = getPayment(selectedOrder);

                      return (
                        <div className="owner-detail-grid">
                          <div>
                            <span>Payment Method</span>
                            <strong>
                              {payment?.payment_method ||
                                selectedOrder.payment_method ||
                                "N/A"}
                            </strong>
                          </div>

                          <div>
                            <span>Payment Amount</span>
                            <strong>
                              {formatMoney(
                                payment?.amount ?? selectedOrder.grand_total
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>Payment Status</span>
                            <strong>
                              {payment?.payment_status ||
                                selectedOrder.payment_status ||
                                "Not available"}
                            </strong>
                          </div>

                          <div>
                            <span>Transaction Reference</span>
                            <strong>
                              {payment?.transaction_reference || "N/A"}
                            </strong>
                          </div>

                          <div>
                            <span>Reviewed Date</span>
                            <strong>
                              {formatDate(payment?.reviewed_at)}
                            </strong>
                          </div>

                          <div>
                            <span>Rejection Reason</span>
                            <strong>
                              {payment?.rejection_reason || "N/A"}
                            </strong>
                          </div>

                          {payment?.receipt_path && (
                            <div className="owner-detail-full">
                              <span>Payment Receipt</span>
                              <a
                                href={
                                  payment.receipt_path.startsWith("http")
                                    ? payment.receipt_path
                                    : `http://localhost:5134${
                                        payment.receipt_path.startsWith("/")
                                          ? ""
                                          : "/"
                                      }${payment.receipt_path}`
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="owner-receipt-link"
                              >
                                <i className="bi bi-file-earmark-image me-2"></i>
                                View payment receipt
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Worker activity */}
                  <div className="owner-detail-section">
                    <div className="owner-detail-section-heading">
                      <i className="bi bi-person-check"></i>
                      <h6>Worker Activity History</h6>
                    </div>

                    {(selectedOrder.reviews || []).length === 0 ? (
                      <div className="owner-detail-empty-history">
                        <i className="bi bi-clock-history"></i>
                        <span>No worker approval or rejection activity yet.</span>
                      </div>
                    ) : (
                      <div className="owner-review-timeline">
                        {selectedOrder.reviews.map((review) => (
                          <div
                            className="owner-review-item"
                            key={review.id}
                          >
                            <div
                              className={`owner-review-dot ${
                                review.action === "Approved"
                                  ? "review-approved"
                                  : "review-rejected"
                              }`}
                            >
                              <i
                                className={`bi ${
                                  review.action === "Approved"
                                    ? "bi-check-lg"
                                    : "bi-x-lg"
                                }`}
                              ></i>
                            </div>

                            <div className="owner-review-content">
                              <strong>
                                Order {review.action}
                              </strong>
                              <span>
                                Worker:{" "}
                                {review.handled_by ||
                                  review.worker_name ||
                                  review.worker_full_name ||
                                  `Worker #${review.worker_id}`}
                              </span>

                              {review.reason && (
                                <p>Reason: {review.reason}</p>
                              )}

                              <small>{formatDate(review.created_at)}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="owner-order-owner-note">
                    <i className="bi bi-info-circle"></i>
                    Workers are responsible for approving or rejecting
                    customer orders. This page is for owner monitoring and
                    order management.
                  </div>
                </>
              )}
            </div>

            <div className="owner-order-modal-footer">
              <button
                className="btn btn-light"
                onClick={closeDetails}
              >
                Close
              </button>

              <button
                className="btn btn-danger"
                onClick={() => deleteOrder(selectedOrder)}
                disabled={deletingId === selectedOrder.id}
              >
                <i className="bi bi-trash3 me-2"></i>
                {deletingId === selectedOrder.id
                  ? "Deleting..."
                  : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OwnerOnlineOrders;
