import { useCallback, useEffect, useMemo, useState } from "react";
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
  Table,
} from "react-bootstrap";

const API = "http://localhost:5134/api";

const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Rejected",
];

function getToken() {
  return sessionStorage.getItem("freshmartToken");
}

function getOrderId(order) {
  return order?.id ?? order?.order_id;
}

// Supports both nested payment data and the flat fields
// returned by the owner-order backend controller.
function getPayment(order) {
  if (!order) return null;

  const nestedPayment =
    order.payment ||
    order.latest_payment ||
    order.payment_details ||
    order.payments?.[0];

  if (nestedPayment) return nestedPayment;

  const hasFlatPayment =
    order.payment_id != null ||
    order.receipt_path ||
    order.payment_status ||
    order.recorded_payment_method ||
    order.payment_reviewed_by != null ||
    order.reviewed_by_name;

  if (!hasFlatPayment) return null;

  return {
    id: order.payment_id,
    payment_method:
      order.recorded_payment_method || order.payment_method,
    amount: order.payment_amount,
    payment_status: order.payment_status,
    transaction_reference: order.transaction_reference,
    receipt_path: order.receipt_path,
    rejection_reason: order.payment_rejection_reason,
    reviewed_by: order.payment_reviewed_by,
    reviewed_at: order.payment_reviewed_at,
    reviewed_by_name: order.reviewed_by_name,
  };
}

function getPaymentStatus(order) {
  const payment = getPayment(order);
  return payment?.payment_status || order?.payment_status || "Unknown";
}

function getPaymentMethod(order) {
  const payment = getPayment(order);

  return (
    payment?.payment_method ||
    payment?.recorded_payment_method ||
    order?.payment_method ||
    order?.recorded_payment_method ||
    "Not specified"
  );
}

function isCashOnDelivery(order) {
  return /cash\s*on\s*delivery/i.test(getPaymentMethod(order));
}

function getCustomerName(order) {
  return (
    order?.customer_name ||
    order?.full_name ||
    order?.customer?.full_name ||
    order?.customer?.customer_name ||
    "Unknown customer"
  );
}

function getOrderTotal(order) {
  return Number(
    order?.total_amount ??
      order?.grand_total ??
      order?.total ??
      0
  );
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

function getStatusVariant(status) {
  switch (status) {
    case "Pending":
      return "warning";
    case "Confirmed":
      return "primary";
    case "Preparing":
      return "info";
    case "Ready":
      return "success";
    case "Out for Delivery":
      return "info";
    case "Delivered":
      return "success";
    case "Cancelled":
      return "secondary";
    case "Rejected":
      return "danger";
    default:
      return "secondary";
  }
}

function getPaymentVariant(status) {
  switch (status) {
    case "Approved":
      return "success";
    case "Rejected":
      return "danger";
    case "Pending":
      return "warning";
    default:
      return "secondary";
  }
}

function getReviewAction(review) {
  return review?.action || review?.review_action || review?.status || "";
}

function getReviewDate(review) {
  return (
    review?.reviewed_at ||
    review?.created_at ||
    review?.action_date ||
    review?.updated_at
  );
}

// The backend returns the worker name as "handled_by".
function getReviewPerson(review) {
  const workerName =
    review?.handled_by ||
    review?.reviewer_name ||
    review?.worker_name ||
    review?.reviewed_by_name ||
    review?.username ||
    review?.full_name;

  if (workerName) return workerName;

  if (review?.worker_id) {
    return `Worker ID #${review.worker_id}`;
  }

  return "Not recorded";
}

/*
  Owner deletion is allowed only when all three conditions are true:

  1. Order status is Confirmed.
  2. Payment status is Approved.
  3. An Approved review exists.

  The backend must enforce these conditions too.
*/
function canOwnerDeleteOrder(order) {
  if (!order) return false;

  const paymentStatus = getPaymentStatus(order);

  const reviews = Array.isArray(order.reviews)
    ? order.reviews
    : [];

  const hasApprovedReview = reviews.some(
    (review) => getReviewAction(review) === "Approved"
  );

  return (
    order.order_status === "Confirmed" &&
    paymentStatus === "Approved" &&
    hasApprovedReview
  );
}

function getItems(order) {
  if (Array.isArray(order?.items)) return order.items;
  if (Array.isArray(order?.order_items)) return order.order_items;
  return [];
}

function getProductName(item) {
  return (
    item?.product_name ||
    item?.name ||
    item?.product?.product_name ||
    "Product"
  );
}

function getProductQuantity(item) {
  return Number(item?.quantity || item?.qty || 0);
}

function getProductPrice(item) {
  return Number(
    item?.selling_price ??
      item?.unit_price ??
      item?.price ??
      0
  );
}

function getProductSubtotal(item) {
  const explicitSubtotal =
    item?.subtotal ??
    item?.total_price ??
    item?.line_total;

  if (explicitSubtotal !== undefined && explicitSubtotal !== null) {
    return Number(explicitSubtotal);
  }

  return getProductQuantity(item) * getProductPrice(item);
}

export default function OwnerOnlineOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [showResetPin, setShowResetPin] = useState(false);
  const [resetPinOrder, setResetPinOrder] = useState(null);

  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [resetPinLoading, setResetPinLoading] = useState(false);
  const [resetPinError, setResetPinError] = useState("");

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");

  const authHeaders = useCallback(() => {
    const token = getToken();

    return {
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const loadOrders = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const token = getToken();

      if (!token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const response = await fetch(`${API}/owner-orders`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to load online orders."
        );
      }

      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      console.error("Load owner orders error:", err);
      setError(err.message || "Unable to load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Revoke the private receipt preview URL when it changes or the component closes.
  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  const filteredOrders = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "All" ||
        order.order_status === statusFilter;

      const orderId = String(getOrderId(order) || "");
      const customerName = getCustomerName(order).toLowerCase();
      const phone = String(
        order.phone ||
          order.customer_phone ||
          order.customer?.phone ||
          ""
      ).toLowerCase();

      const matchesSearch =
        !searchText ||
        orderId.toLowerCase().includes(searchText) ||
        customerName.includes(searchText) ||
        phone.includes(searchText);

      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const statistics = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter(
        (order) => order.order_status === "Pending"
      ).length,
      confirmed: orders.filter(
        (order) => order.order_status === "Confirmed"
      ).length,
      delivered: orders.filter(
        (order) => order.order_status === "Delivered"
      ).length,
      rejected: orders.filter(
        (order) => order.order_status === "Rejected"
      ).length,
    };
  }, [orders]);

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedOrder(null);
    setReceiptError("");
    setReceiptLoading(false);
    setReceiptPreviewUrl("");
  };

  const loadReceiptPreview = async (order) => {
    const orderId = getOrderId(order);
    const payment = getPayment(order);

    if (!orderId || !payment?.receipt_path) {
      setReceiptError("No payment receipt was uploaded for this order.");
      return;
    }

    if (isCashOnDelivery(order)) {
      return;
    }

    try {
      setReceiptLoading(true);
      setReceiptError("");

      const token = getToken();

      if (!token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      /*
        This is a protected endpoint.
        Do not use payment.receipt_path directly as a public URL.
      */
      const response = await fetch(
        `${API}/owner-orders/${orderId}/receipt`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        throw new Error(
          data.message ||
            data.error ||
            "Unable to load the payment receipt."
        );
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.startsWith("image/")) {
        throw new Error("The receipt response is not a valid image.");
      }

      const blob = await response.blob();
      const previewUrl = URL.createObjectURL(blob);

      setReceiptPreviewUrl(previewUrl);
    } catch (err) {
      console.error("Load receipt preview error:", err);
      setReceiptError(err.message || "Unable to preview receipt.");
    } finally {
      setReceiptLoading(false);
    }
  };

  const openOrderDetails = async (order) => {
    const orderId = getOrderId(order);

    if (!orderId) {
      setError("This order does not have a valid order ID.");
      return;
    }

    try {
      setShowDetails(true);
      setDetailsLoading(true);
      setSelectedOrder(order);
      setReceiptError("");
      setReceiptPreviewUrl("");

      const response = await fetch(
        `${API}/owner-orders/${orderId}`,
        {
          method: "GET",
          headers: authHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to load order details."
        );
      }

      const fullOrder = data.order || order;

      setSelectedOrder(fullOrder);

      if (
        getPayment(fullOrder)?.receipt_path &&
        !isCashOnDelivery(fullOrder)
      ) {
        await loadReceiptPreview(fullOrder);
      }
    } catch (err) {
      console.error("Open owner order details error:", err);
      setReceiptError("");
      setError(err.message || "Unable to load order details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const openDeleteConfirmation = (order) => {
    if (!canOwnerDeleteOrder(order)) {
      setError(
        "This order cannot be permanently deleted. It must be Confirmed, have Approved payment, and have an Approved review."
      );
      return;
    }

    setError("");
    setSuccess("");
    setOrderToDelete(order);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirmation = () => {
    if (deleteLoading) return;

    setShowDeleteConfirm(false);
    setOrderToDelete(null);
  };

  const deleteOrder = async () => {
    if (!orderToDelete) return;

    const orderId = getOrderId(orderToDelete);

    if (!canOwnerDeleteOrder(orderToDelete)) {
      setError("This order is not eligible for permanent deletion.");
      closeDeleteConfirmation();
      return;
    }

    try {
      setDeleteLoading(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `${API}/owner-orders/${orderId}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to delete the order."
        );
      }

      setOrders((previousOrders) =>
        previousOrders.filter(
          (order) => String(getOrderId(order)) !== String(orderId)
        )
      );

      setShowDeleteConfirm(false);
      setOrderToDelete(null);

      if (
        selectedOrder &&
        String(getOrderId(selectedOrder)) === String(orderId)
      ) {
        closeDetails();
      }

      setSuccess(`Order #${orderId} was permanently deleted.`);
    } catch (err) {
      console.error("Delete owner order error:", err);
      setError(err.message || "Unable to delete the order.");
    } finally {
      setDeleteLoading(false);
    }
  };
    
const openResetPinModal = (order) => {
  setResetPinOrder(order);
  setNewPin("");
  setConfirmPin("");
  setResetPinError("");
  setShowResetPin(true);
};

const closeResetPinModal = () => {
  if (resetPinLoading) return;

  setShowResetPin(false);
  setResetPinOrder(null);
  setNewPin("");
  setConfirmPin("");
  setResetPinError("");
};

const handleResetCustomerPin = async () => {
  if (!resetPinOrder) return;

  if (!/^\d{4,6}$/.test(newPin)) {
    setResetPinError("PIN must contain 4 to 6 digits.");
    return;
  }

  if (newPin !== confirmPin) {
    setResetPinError("PIN confirmation does not match.");
    return;
  }

  try {
    setResetPinLoading(true);
    setResetPinError("");

    const orderId = getOrderId(resetPinOrder);

    const response = await fetch(
      `${API}/owner-orders/${orderId}/reset-pin`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPin,
          confirmPin,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message || "Failed to reset customer PIN."
      );
    }

    setSuccess(data.message || "Customer PIN reset successfully.");

    setShowResetPin(false);
    setResetPinOrder(null);
    setNewPin("");
    setConfirmPin("");

  } catch (err) {
    console.error("Reset customer PIN error:", err);
    setResetPinError(err.message || "Unable to reset customer PIN.");
  } finally {
    setResetPinLoading(false);
  }
};

  const renderPaymentStatus = (order) => {
    const status = getPaymentStatus(order);

    return (
      <Badge bg={getPaymentVariant(status)}>
        {status}
      </Badge>
    );
  };

  const renderOrderStatus = (status) => (
    <Badge bg={getStatusVariant(status)}>
      {status || "Unknown"}
    </Badge>
  );

  const selectedPayment = selectedOrder
    ? getPayment(selectedOrder)
    : null;

  const selectedItems = selectedOrder
    ? getItems(selectedOrder)
    : [];

  const selectedReviews = Array.isArray(selectedOrder?.reviews)
    ? selectedOrder.reviews
    : [];

  return (
    <div className="owner-online-orders">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h3 className="mb-1">Online Orders</h3>
          <p className="text-muted mb-0">
            Monitor customer orders, payment approval, and worker activity.
          </p>
        </div>

        <Button
          variant="outline-primary"
          onClick={() => loadOrders(false)}
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
        </Alert>
      )}

      {/* Statistics */}
      <Row className="g-3 mb-4">
        <Col xs={6} md={4} xl>
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="text-muted small">Total Orders</div>
              <h3 className="mb-0">{statistics.total}</h3>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} xl>
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="text-muted small">Pending</div>
              <h3 className="mb-0 text-warning">
                {statistics.pending}
              </h3>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} xl>
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="text-muted small">Confirmed</div>
              <h3 className="mb-0 text-primary">
                {statistics.confirmed}
              </h3>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} xl>
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="text-muted small">Delivered</div>
              <h3 className="mb-0 text-success">
                {statistics.delivered}
              </h3>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={6} md={4} xl>
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="text-muted small">Rejected</div>
              <h3 className="mb-0 text-danger">
                {statistics.rejected}
              </h3>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Search and filters */}
      <Card className="shadow-sm mb-4">
        <Card.Body>
          <Row className="g-3">
            <Col md={7}>
              <Form.Label>Search orders</Form.Label>
              <Form.Control
                type="search"
                placeholder="Search by order ID, customer name, or phone..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Col>

            <Col md={5}>
              <Form.Label>Filter by order status</Form.Label>
              <Form.Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="All">All Orders</option>

                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Orders table */}
      <Card className="shadow-sm">
        <Card.Header className="bg-white py-3">
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Customer Orders</h5>
            <Badge bg="secondary">
              {filteredOrders.length} orders
            </Badge>
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="text-muted mt-2 mb-0">
                Loading orders...
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-inbox fs-1 text-muted" />
              <h6 className="mt-2">No orders found</h6>
              <p className="text-muted mb-0">
                Try changing the search text or status filter.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Order Status</th>
                    <th>Reviewed By</th>
                    <th>Review Action</th>
                    <th>Date</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order) => {
                    const orderId = getOrderId(order);

                    return (
                      <tr key={orderId}>
                        <td className="fw-semibold">
                          #{orderId}
                        </td>

                        <td>{getCustomerName(order)}</td>

                        <td>
                          {order.phone ||
                            order.customer_phone ||
                            order.customer?.phone ||
                            "—"}
                        </td>

                        <td className="fw-semibold">
                          {formatMoney(getOrderTotal(order))}
                        </td>

                        <td>
                          <div className="small mb-1">
                            {getPaymentMethod(order)}
                          </div>
                          {renderPaymentStatus(order)}
                        </td>

                        <td>
                          {renderOrderStatus(order.order_status)}
                        </td>

                        <td>
                          {order.last_handled_by || "Not reviewed"}
                        </td>

                        <td>
                          {order.last_review_action ? (
                            <Badge
                              bg={
                                order.last_review_action === "Approved"
                                  ? "success"
                                  : order.last_review_action === "Rejected"
                                  ? "danger"
                                  : "secondary"
                              }
                            >
                              {order.last_review_action}
                            </Badge>
                          ) : (
                            "—"
                          )}

                          <div className="small text-muted">
                            {formatDate(order.last_review_at)}
                          </div>
                        </td>

                        <td className="small">
                          {formatDate(
                            order.created_at ||
                              order.order_date ||
                              order.date
                          )}
                        </td>

                        <td>
                          <div className="d-flex justify-content-center gap-2">
                            <Button
                              size="sm"
                              variant="outline-primary"
                              title="View order details"
                              onClick={() => openOrderDetails(order)}
                            >
                              <i className="bi bi-eye" />
                            </Button>
                           <Button
                          size="sm"
                       variant="outline-warning"
                      title="Reset customer PIN"
                    onClick={() => openResetPinModal(order)}
                                                      >
                        <i className="bi bi-key-fill" />
                             </Button>

                            {canOwnerDeleteOrder(order) && (
                              <Button
                                size="sm"
                                variant="outline-danger"
                                title="Permanently delete order"
                                onClick={() =>
                                  openDeleteConfirmation(order)
                                }
                              >
                                <i className="bi bi-trash" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Order details modal */}
      <Modal
        show={showDetails}
        onHide={closeDetails}
        size="xl"
        centered
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Order Details
            {selectedOrder &&
              ` #${getOrderId(selectedOrder)}`}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {detailsLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
              <p className="text-muted mt-2">
                Loading order details...
              </p>
            </div>
          ) : selectedOrder ? (
            <>
              {/* Customer and order information */}
              <Row className="g-3 mb-4">
                <Col md={6}>
                  <Card className="h-100">
                    <Card.Body>
                      <h6 className="mb-3">Customer Information</h6>

                      <p className="mb-2">
                        <strong>Name:</strong>{" "}
                        {getCustomerName(selectedOrder)}
                      </p>

                      <p className="mb-2">
                        <strong>Phone:</strong>{" "}
                        {selectedOrder.phone ||
                          selectedOrder.customer_phone ||
                          selectedOrder.customer?.phone ||
                          "—"}
                      </p>

                      <p className="mb-2">
                        <strong>Delivery location:</strong>{" "}
                        {selectedOrder.delivery_location ||
                          selectedOrder.deliveryLocation ||
                          selectedOrder.address ||
                          "—"}
                      </p>

                      <p className="mb-0">
                        <strong>Order date:</strong>{" "}
                        {formatDate(
                          selectedOrder.created_at ||
                            selectedOrder.order_date
                        )}
                      </p>
                    </Card.Body>
                  </Card>
                </Col>

                <Col md={6}>
                  <Card className="h-100">
                    <Card.Body>
                      <h6 className="mb-3">Order Information</h6>

                      <p className="mb-2">
                        <strong>Order ID:</strong>{" "}
                        #{getOrderId(selectedOrder)}
                      </p>

                      <p className="mb-2">
                        <strong>Order status:</strong>{" "}
                        {renderOrderStatus(
                          selectedOrder.order_status
                        )}
                      </p>

                      <p className="mb-2">
                        <strong>Payment status:</strong>{" "}
                        {renderPaymentStatus(selectedOrder)}
                      </p>

                      <p className="mb-0">
                        <strong>Total amount:</strong>{" "}
                        {formatMoney(getOrderTotal(selectedOrder))}
                      </p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Products */}
              <h6 className="mb-3">Ordered Products</h6>

              <div className="table-responsive mb-4">
                <Table bordered hover size="sm" className="align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Product</th>
                      <th className="text-center">Quantity</th>
                      <th className="text-end">Unit Price</th>
                      <th className="text-end">Subtotal</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedItems.length > 0 ? (
                      selectedItems.map((item, index) => (
                        <tr
                          key={
                            item.id ||
                            item.order_item_id ||
                            `${getProductName(item)}-${index}`
                          }
                        >
                          <td>{getProductName(item)}</td>

                          <td className="text-center">
                            {getProductQuantity(item)}
                          </td>

                          <td className="text-end">
                            {formatMoney(getProductPrice(item))}
                          </td>

                          <td className="text-end">
                            {formatMoney(getProductSubtotal(item))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="text-center text-muted">
                          No product details available.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  <tfoot>
                    <tr>
                      <th colSpan="3" className="text-end">
                        Order Total
                      </th>
                      <th className="text-end">
                        {formatMoney(getOrderTotal(selectedOrder))}
                      </th>
                    </tr>
                  </tfoot>
                </Table>
              </div>

              {/* Payment information */}
              <Card className="mb-4">
                <Card.Body>
                  <h6 className="mb-3">Payment Information</h6>

                  <Row className="g-3">
                    <Col md={6}>
                      <p className="mb-2">
                        <strong>Payment method:</strong>{" "}
                        {getPaymentMethod(selectedOrder)}
                      </p>

                      <p className="mb-2">
                        <strong>Payment status:</strong>{" "}
                        {renderPaymentStatus(selectedOrder)}
                      </p>

                      <p className="mb-0">
                        <strong>Transaction reference:</strong>{" "}
                        {selectedPayment?.transaction_reference ||
                          selectedPayment?.transaction_id ||
                          selectedOrder.transaction_reference ||
                          "—"}
                      </p>
                    </Col>

                    <Col md={6}>
                      <p className="mb-2">
                        <strong>Payment reviewed by:</strong>{" "}
                        {selectedPayment?.reviewer_name ||
                          selectedPayment?.reviewed_by_name ||
                          selectedPayment?.worker_name ||
                          selectedOrder?.last_handled_by ||
                          (selectedReviews.length > 0
                            ? getReviewPerson(selectedReviews[0])
                            : "Not recorded")}
                      </p>

                      <p className="mb-0">
                        <strong>Payment reviewed at:</strong>{" "}
                        {formatDate(
                          selectedPayment?.reviewed_at ||
                            selectedOrder?.last_review_at ||
                            (selectedReviews.length > 0
                              ? getReviewDate(selectedReviews[0])
                              : null)
                        )}
                      </p>
                    </Col>
                  </Row>

                  <hr />

                  <h6 className="mb-3">Payment Receipt</h6>

                  {isCashOnDelivery(selectedOrder) ? (
                    <Alert variant="info" className="mb-0">
                      <i className="bi bi-cash-coin me-2" />
                      This order uses Cash on Delivery. No receipt upload
                      is required. The worker must receive and verify the
                      cash before approving the order.
                    </Alert>
                  ) : receiptLoading ? (
                    <div className="text-center py-4">
                      <Spinner animation="border" size="sm" />
                      <p className="text-muted mt-2 mb-0">
                        Loading receipt...
                      </p>
                    </div>
                  ) : receiptPreviewUrl ? (
                    <div className="text-center">
                      <Image
                        src={receiptPreviewUrl}
                        alt="Customer payment receipt"
                        fluid
                        rounded
                        className="owner-order-receipt"
                      />

                      <div className="mt-2">
                        <a
                          href={receiptPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open receipt in new tab
                        </a>
                      </div>
                    </div>
                  ) : (
                    <Alert variant="warning" className="mb-0">
                      {receiptError ||
                        "No receipt preview is available."}
                    </Alert>
                  )}
                </Card.Body>
              </Card>

              {/* Worker activity and review history */}
              <Card>
                <Card.Body>
                  <h6 className="mb-3">Worker Activity / Review History</h6>

                  {selectedReviews.length > 0 ? (
                    <div className="table-responsive">
                      <Table bordered hover size="sm" className="mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Action</th>
                            <th>Worker</th>
                            <th>Reason / Note</th>
                            <th>Date</th>
                          </tr>
                        </thead>

                        <tbody>
                          {selectedReviews.map((review, index) => {
                            const action = getReviewAction(review);

                            return (
                              <tr
                                key={
                                  review.id ||
                                  review.review_id ||
                                  index
                                }
                              >
                                <td>
                                  <Badge
                                    bg={
                                      action === "Approved"
                                        ? "success"
                                        : action === "Rejected"
                                        ? "danger"
                                        : "secondary"
                                    }
                                  >
                                    {action || "Activity"}
                                  </Badge>
                                </td>

                                <td>{getReviewPerson(review)}</td>

                                <td>
                                  {review.reason ||
                                    review.note ||
                                    review.comment ||
                                    "—"}
                                </td>

                                <td>
                                  {formatDate(getReviewDate(review))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-muted mb-0">
                      No worker review activity has been recorded.
                    </p>
                  )}
                </Card.Body>
              </Card>

              {/* Owner delete action */}
              {canOwnerDeleteOrder(selectedOrder) && (
                <Alert variant="warning" className="mt-4 mb-0">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                      <strong>Permanent deletion available</strong>
                      <div className="small">
                        This order is Confirmed, its payment is Approved,
                        and an Approved worker review exists.
                      </div>
                    </div>

                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        openDeleteConfirmation(selectedOrder)
                      }
                    >
                      <i className="bi bi-trash me-2" />
                      Delete Order
                    </Button>
                  </div>
                </Alert>
              )}
            </>
          ) : (
            <Alert variant="warning">
              Order details are not available.
            </Alert>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeDetails}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
      
       {/* Reset Customer PIN Modal */}
          <Modal
     show={showResetPin}
   onHide={closeResetPinModal}
   centered
   backdrop={resetPinLoading ? "static" : true}
   keyboard={!resetPinLoading}
>
  <Modal.Header closeButton={!resetPinLoading}>
    <Modal.Title>
      <i className="bi bi-shield-lock me-2" />
      Reset Customer PIN
    </Modal.Title>
  </Modal.Header>

  <Modal.Body>
    {resetPinError && (
      <Alert
        variant="danger"
        dismissible
        onClose={() => setResetPinError("")}
      >
        {resetPinError}
      </Alert>
    )}

    <Form.Group className="mb-3">
      <Form.Label>New PIN</Form.Label>

      <Form.Control
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        placeholder="Enter new 4–6 digit PIN"
        value={newPin}
        onChange={(event) =>
          setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        disabled={resetPinLoading}
      />

      <Form.Text className="text-muted">
        Enter a PIN containing 4 to 6 digits.
      </Form.Text>
    </Form.Group>

    <Form.Group className="mb-3">
      <Form.Label>Confirm New PIN</Form.Label>

      <Form.Control
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        placeholder="Confirm new PIN"
        value={confirmPin}
        onChange={(event) =>
          setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        disabled={resetPinLoading}
      />
    </Form.Group>
  </Modal.Body>

  <Modal.Footer>
    <Button
      variant="secondary"
      onClick={closeResetPinModal}
      disabled={resetPinLoading}
    >
      Cancel
    </Button>

    <Button
      variant="warning"
      onClick={handleResetCustomerPin}
      disabled={
        resetPinLoading ||
        !newPin ||
        !confirmPin
      }
    >
      {resetPinLoading ? (
        <>
          <Spinner size="sm" className="me-2" />
          Resetting...
        </>
      ) : (
        <>
          <i className="bi bi-key-fill me-2" />
          Reset PIN
        </>
      )}
    </Button>
  </Modal.Footer>
</Modal>

      {/* Delete confirmation modal */}
      <Modal
        show={showDeleteConfirm}
        onHide={closeDeleteConfirmation}
        centered
      >
        <Modal.Header closeButton={!deleteLoading}>
          <Modal.Title className="text-danger">
            <i className="bi bi-exclamation-triangle me-2" />
            Permanently Delete Order
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <p>
            Are you sure you want to permanently delete order{" "}
            <strong>
              #{orderToDelete && getOrderId(orderToDelete)}
            </strong>
            ?
          </p>

          <Alert variant="danger" className="mb-0">
            <strong>Warning:</strong> This action cannot be undone.
            The order and its related payment, items, and review records
            will be deleted. Stock will not be changed by this deletion.
          </Alert>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeDeleteConfirmation}
            disabled={deleteLoading}
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            onClick={deleteOrder}
            disabled={deleteLoading}
          >
            {deleteLoading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Deleting...
              </>
            ) : (
              <>
                <i className="bi bi-trash me-2" />
                Permanently Delete
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}