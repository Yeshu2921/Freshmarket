
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Table,
} from "react-bootstrap";
import "./WorkerSalesHistory.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

function formatCurrency(value) {
  const amount = Number(value || 0);

  return `ETB ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusVariant(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "rejected") return "danger";
  if (normalized === "delivered") return "success";
  if (normalized === "confirmed") return "primary";
  if (normalized === "preparing") return "info";
  if (normalized === "ready") return "success";
  if (normalized === "out for delivery") return "warning";

  return "secondary";
}

function getPaymentVariant(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "approved" || normalized === "paid") return "success";
  if (normalized === "rejected") return "danger";
  if (normalized === "pending") return "warning";

  return "secondary";
}

function WorkerSalesHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadSalesHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const token = getToken();

      const response = await fetch(
        `${API_BASE}/worker-orders/sales-history`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load sales history.");
      }

      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setError(err.message || "Something went wrong while loading orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSalesHistory();
  }, [loadSalesHistory]);

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return orders.filter((order) => {
      const status = String(order.order_status || "").toLowerCase();

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Rejected" && status === "rejected") ||
        (statusFilter === "Approved" && status !== "rejected");

      const searchableText = [
        order.order_number,
        order.customer_name,
        order.customer_phone,
        order.delivery_location,
        order.payment_method,
        order.order_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && searchableText.includes(search);
    });
  }, [orders, searchTerm, statusFilter]);

  const rejectedCount = orders.filter(
    (order) =>
      String(order.order_status || "").toLowerCase() === "rejected"
  ).length;

  const approvedCount = orders.length - rejectedCount;

  function openDeleteModal(order) {
    setSelectedOrder(order);
    setShowDeleteModal(true);
    setError("");
    setSuccess("");
  }

  function closeDeleteModal() {
    if (deleting) return;

    setShowDeleteModal(false);
    setSelectedOrder(null);
  }

  async function handleDeleteRejectedOrder() {
    if (!selectedOrder) return;

    const orderId = selectedOrder.id;

    if (
      String(selectedOrder.order_status || "").toLowerCase() !== "rejected"
    ) {
      setError("Only rejected orders can be deleted by a worker.");
      closeDeleteModal();
      return;
    }

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const token = getToken();

      const response = await fetch(
        `${API_BASE}/worker-orders/${orderId}/rejected`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete rejected order.");
      }

      // Remove the deleted order from the current screen.
      setOrders((previousOrders) =>
        previousOrders.filter((order) => order.id !== orderId)
      );

      setSuccess(
        `Rejected order ${selectedOrder.order_number || `#${orderId}`} was deleted successfully.`
      );

      setShowDeleteModal(false);
      setSelectedOrder(null);
    } catch (err) {
      setError(err.message || "Unable to delete this order.");
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="worker-sales-history">
      {/* Page heading */}
      <div className="wsh-page-heading">
        <div>
          <div className="wsh-eyebrow">WORKER MANAGEMENT</div>
          <h2>Sales History</h2>
          <p>View approved and rejected customer orders.</p>
        </div>

        <Button
          variant="outline-primary"
          className="wsh-refresh-btn"
          onClick={() => loadSalesHistory(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? (
            <>
              <Spinner size="sm" className="me-2" />
              Refreshing...
            </>
          ) : (
            <>
              <i className="bi bi-arrow-clockwise me-2" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {/* Alerts */}
      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError("")}
          className="wsh-alert"
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          variant="success"
          dismissible
          onClose={() => setSuccess("")}
          className="wsh-alert"
        >
          {success}
        </Alert>
      )}

      {/* Summary cards */}
      <Row className="g-3 wsh-summary-row">
        <Col xs={12} sm={4}>
          <Card className="wsh-stat-card">
            <Card.Body>
              <div className="wsh-stat-icon wsh-stat-total">
                <i className="bi bi-receipt" />
              </div>
              <div>
                <span className="wsh-stat-label">Total Orders</span>
                <h3>{orders.length}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={4}>
          <Card className="wsh-stat-card">
            <Card.Body>
              <div className="wsh-stat-icon wsh-stat-approved">
                <i className="bi bi-check-circle" />
              </div>
              <div>
                <span className="wsh-stat-label">Approved Orders</span>
                <h3>{approvedCount}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={4}>
          <Card className="wsh-stat-card">
            <Card.Body>
              <div className="wsh-stat-icon wsh-stat-rejected">
                <i className="bi bi-x-circle" />
              </div>
              <div>
                <span className="wsh-stat-label">Rejected Orders</span>
                <h3>{rejectedCount}</h3>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Main content */}
      <Card className="wsh-main-card">
        <Card.Body>
          <div className="wsh-toolbar">
            <div>
              <h5>Order Records</h5>
              <span className="wsh-toolbar-subtitle">
                {filteredOrders.length} order
                {filteredOrders.length === 1 ? "" : "s"} found
              </span>
            </div>

            <div className="wsh-toolbar-controls">
              <InputGroup className="wsh-search">
                <InputGroup.Text>
                  <i className="bi bi-search" />
                </InputGroup.Text>
                <Form.Control
                  type="search"
                  placeholder="Search order or customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>

              <Form.Select
                className="wsh-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter orders by status"
              >
                <option value="All">All Orders</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </Form.Select>
            </div>
          </div>

          {loading ? (
            <div className="wsh-loading">
              <Spinner animation="border" variant="primary" />
              <p>Loading sales history...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="wsh-empty-state">
              <div className="wsh-empty-icon">
                <i className="bi bi-receipt-cutoff" />
              </div>
              <h5>No orders found</h5>
              <p>
                {orders.length === 0
                  ? "Approved and rejected orders will appear here."
                  : "Try changing your search or filter."}
              </p>
              {searchTerm || statusFilter !== "All" ? (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("All");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop and tablet table */}
              <div className="table-responsive wsh-table-wrapper">
                <Table hover className="wsh-table align-middle">
                  <thead>
                    <tr>
                      <th>ORDER</th>
                      <th>CUSTOMER</th>
                      <th>DATE</th>
                      <th>ITEMS</th>
                      <th>TOTAL</th>
                      <th>PAYMENT</th>
                      <th>STATUS</th>
                      <th className="text-end">ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredOrders.map((order) => {
                      const isRejected =
                        String(order.order_status || "").toLowerCase() ===
                        "rejected";

                      return (
                        <tr key={order.id}>
                          <td>
                            <div className="wsh-order-number">
                              {order.order_number || `#${order.id}`}
                            </div>
                            <small className="wsh-muted">
                              ID: {order.id}
                            </small>
                          </td>

                          <td>
                            <div className="wsh-customer-name">
                              {order.customer_name || "Unknown customer"}
                            </div>
                            <small className="wsh-muted">
                              {order.customer_phone || "No phone"}
                            </small>
                          </td>

                          <td>
                            <span className="wsh-date">
                              {formatDate(order.created_at)}
                            </span>
                          </td>

                          <td>
                            <span className="wsh-items-count">
                              {Number(order.total_items || 0)} items
                            </span>
                          </td>

                          <td>
                            <strong className="wsh-total">
                              {formatCurrency(order.grand_total)}
                            </strong>
                          </td>

                          <td>
                            <div className="wsh-payment-method">
                              {order.payment_method || "—"}
                            </div>
                            <Badge
                              bg={getPaymentVariant(order.payment_status)}
                              className="wsh-payment-badge"
                            >
                              {order.payment_status || "Unknown"}
                            </Badge>
                          </td>

                          <td>
                            <Badge
                              bg={getStatusVariant(order.order_status)}
                              className="wsh-status-badge"
                            >
                              {order.order_status || "Unknown"}
                            </Badge>
                          </td>

                          <td className="text-end">
                            {isRejected ? (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                className="wsh-delete-btn"
                                onClick={() => openDeleteModal(order)}
                                title="Delete rejected order"
                              >
                                <i className="bi bi-trash3 me-1" />
                                Delete
                              </Button>
                            ) : (
                              <span className="wsh-protected-label">
                                <i className="bi bi-shield-lock me-1" />
                                Protected
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {/* Mobile order cards */}
              <div className="wsh-mobile-list">
                {filteredOrders.map((order) => {
                  const isRejected =
                    String(order.order_status || "").toLowerCase() ===
                    "rejected";

                  return (
                    <div className="wsh-mobile-order" key={order.id}>
                      <div className="wsh-mobile-order-top">
                        <div>
                          <strong>
                            {order.order_number || `#${order.id}`}
                          </strong>
                          <small>{formatDate(order.created_at)}</small>
                        </div>
                        <Badge bg={getStatusVariant(order.order_status)}>
                          {order.order_status || "Unknown"}
                        </Badge>
                      </div>

                      <div className="wsh-mobile-customer">
                        <i className="bi bi-person-circle" />
                        <div>
                          <strong>
                            {order.customer_name || "Unknown customer"}
                          </strong>
                          <small>{order.customer_phone || "No phone"}</small>
                        </div>
                      </div>

                      <div className="wsh-mobile-details">
                        <div>
                          <span>Items</span>
                          <strong>{Number(order.total_items || 0)}</strong>
                        </div>
                        <div>
                          <span>Total</span>
                          <strong>{formatCurrency(order.grand_total)}</strong>
                        </div>
                        <div>
                          <span>Payment</span>
                          <strong>{order.payment_status || "Unknown"}</strong>
                        </div>
                      </div>

                      {isRejected && order.rejection_reason && (
                        <div className="wsh-rejection-reason">
                          <strong>Rejection reason:</strong>
                          <span>{order.rejection_reason}</span>
                        </div>
                      )}

                      <div className="wsh-mobile-action">
                        {isRejected ? (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            className="wsh-delete-btn"
                            onClick={() => openDeleteModal(order)}
                          >
                            <i className="bi bi-trash3 me-1" />
                            Delete rejected order
                          </Button>
                        ) : (
                          <span className="wsh-protected-label">
                            <i className="bi bi-shield-lock me-1" />
                            This order is protected
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        show={showDeleteModal}
        onHide={closeDeleteModal}
        centered
        backdrop="static"
        className="wsh-delete-modal"
      >
        <Modal.Header closeButton={!deleting}>
          <Modal.Title>
            <i className="bi bi-exclamation-triangle text-danger me-2" />
            Delete Rejected Order
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <p>
            Are you sure you want to delete this rejected order?
          </p>

          {selectedOrder && (
            <div className="wsh-delete-order-info">
              <span>Order number</span>
              <strong>
                {selectedOrder.order_number || `#${selectedOrder.id}`}
              </strong>

              <span>Customer</span>
              <strong>
                {selectedOrder.customer_name || "Unknown customer"}
              </strong>

              <span>Total amount</span>
              <strong>{formatCurrency(selectedOrder.grand_total)}</strong>
            </div>
          )}

          <Alert variant="warning" className="mb-0 mt-3">
            This action permanently removes the rejected order from the
            system, including the customer's order history. Approved and
            completed orders cannot be deleted by workers.
          </Alert>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="light"
            onClick={closeDeleteModal}
            disabled={deleting}
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            onClick={handleDeleteRejectedOrder}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Spinner size="sm" className="me-2" />
                Deleting...
              </>
            ) : (
              <>
                <i className="bi bi-trash3 me-2" />
                Yes, Delete Order
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default WorkerSalesHistory;
