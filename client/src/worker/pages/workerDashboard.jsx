
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Row,
  Spinner,
} from "react-bootstrap";

import "./workerDashboard.css";

const API_BASE = "http://localhost:5134/api";

const currencyFormatter = new Intl.NumberFormat("en-ET", {
  style: "currency",
  currency: "ETB",
  minimumFractionDigits: 2,
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString("en-ET", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionBadge(action) {
  if (action === "Approved") {
    return <Badge bg="success">Approved</Badge>;
  }

  if (action === "Rejected") {
    return <Badge bg="danger">Rejected</Badge>;
  }

  return <Badge bg="secondary">{action || "Unknown"}</Badge>;
}

function WorkerDashboard({ name = "Worker" }) {
  const [dashboard, setDashboard] = useState({
    summary: {
      todaySales: 0,
      transactions: 0,
      availableProducts: 0,
      pendingOrders: 0,
    },
    recentActivity: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const token = sessionStorage.getItem("freshmartToken");

      if (!token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const response = await fetch(`${API_BASE}/worker-dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load worker dashboard."
        );
      }

      setDashboard({
        summary: {
          todaySales: Number(data.dashboard?.summary?.todaySales || 0),
          transactions: Number(data.dashboard?.summary?.transactions || 0),
          availableProducts: Number(
            data.dashboard?.summary?.availableProducts || 0
          ),
          pendingOrders: Number(
            data.dashboard?.summary?.pendingOrders || 0
          ),
        },
        recentActivity: Array.isArray(data.dashboard?.recentActivity)
          ? data.dashboard.recentActivity
          : [],
      });
    } catch (err) {
      console.error("Worker dashboard error:", err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const summaryCards = [
    {
      title: "Today's Sales",
      value: formatCurrency(dashboard.summary.todaySales),
      icon: "bi-cash-stack",
      description: "Value of orders you approved today",
      color: "green",
    },
    {
      title: "Transactions",
      value: dashboard.summary.transactions.toLocaleString(),
      icon: "bi-receipt",
      description: "Orders you approved today",
      color: "blue",
    },
    {
      title: "Available Products",
      value: dashboard.summary.availableProducts.toLocaleString(),
      icon: "bi-box-seam",
      description: "Active supermarket products",
      color: "purple",
    },
    {
      title: "Pending Orders",
      value: dashboard.summary.pendingOrders.toLocaleString(),
      icon: "bi-bag-check",
      description: "Orders waiting for worker action",
      color: "orange",
    },
  ];

  return (
    <Container fluid className="worker-dashboard px-0">
      {/* Dashboard heading */}
      <Row className="wd-welcome align-items-center g-3">
        <Col xs={12} md>
          <Badge bg="success" className="wd-eyebrow">
            WORKER PANEL
          </Badge>

          <h2 className="wd-page-title">Dashboard</h2>

          <p className="wd-welcome-text">
            Welcome back, {name}. Here's your work overview.
          </p>
        </Col>

        <Col xs={12} md="auto">
          <div className="wd-header-actions">
            <div className="wd-date">
              <i className="bi bi-calendar3" />
              <span>{new Date().toLocaleDateString("en-ET", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}</span>
            </div>

            <Button
              variant="outline-success"
              className="wd-refresh-btn"
              onClick={() => fetchDashboard(true)}
              disabled={loading || refreshing}
            >
              {refreshing ? (
                <Spinner size="sm" animation="border" />
              ) : (
                <i className="bi bi-arrow-clockwise" />
              )}
              <span>Refresh</span>
            </Button>
          </div>
        </Col>
      </Row>

      {/* Error message */}
      {error && (
        <Alert
          variant="danger"
          className="wd-error-alert d-flex align-items-center justify-content-between"
        >
          <span>
            <i className="bi bi-exclamation-circle me-2" />
            {error}
          </span>

          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => fetchDashboard(true)}
          >
            Try again
          </Button>
        </Alert>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="wd-loading">
          <Spinner animation="border" variant="success" />
          <p>Loading your dashboard...</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <Row className="g-3 wd-summary-grid">
            {summaryCards.map((card) => (
              <Col xs={12} sm={6} xl={3} key={card.title}>
                <Card className="wd-summary-card h-100">
                  <Card.Body>
                    <div className="wd-card-top">
                      <div className={`wd-card-icon ${card.color}`}>
                        <i className={`bi ${card.icon}`} />
                      </div>

                      <span className="wd-card-indicator">
                        <i className="bi bi-graph-up-arrow" />
                      </span>
                    </div>

                    <p className="wd-card-title">{card.title}</p>

                    <h3 className="wd-card-value">{card.value}</h3>

                    <p className="wd-card-description">
                      {card.description}
                    </p>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          {/* Main dashboard panels */}
          <Row className="g-3 wd-main-grid">
            {/* Recent activity */}
            <Col xs={12} xl={7}>
              <Card className="wd-panel h-100">
                <Card.Body>
                  <div className="wd-panel-heading">
                    <div>
                      <h4>Recent Activity</h4>
                      <p>Your latest order approval and rejection history.</p>
                    </div>

                    <div className="wd-panel-heading-icon">
                      <i className="bi bi-clock-history" />
                    </div>
                  </div>

                  {dashboard.recentActivity.length === 0 ? (
                    <div className="wd-empty-state">
                      <div className="wd-empty-icon">
                        <i className="bi bi-clipboard-check" />
                      </div>

                      <strong>No recent activity</strong>

                      <p>
                        Your approved and rejected orders will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="wd-activity-list">
                      {dashboard.recentActivity.map((activity) => (
                        <div
                          className="wd-activity-item"
                          key={activity.id}
                        >
                          <div
                            className={`wd-activity-icon ${
                              activity.action === "Approved"
                                ? "approved"
                                : "rejected"
                            }`}
                          >
                            <i
                              className={`bi ${
                                activity.action === "Approved"
                                  ? "bi-check-lg"
                                  : "bi-x-lg"
                              }`}
                            />
                          </div>

                          <div className="wd-activity-details">
                            <div className="wd-activity-title-row">
                              <strong>
                                Order {activity.order_number || `#${activity.order_id}`}
                              </strong>

                              {getActionBadge(activity.action)}
                            </div>

                            <p>
                              Customer: {activity.customer_name || "Unknown"}
                            </p>

                            {activity.reason && (
                              <p className="wd-rejection-reason">
                                Reason: {activity.reason}
                              </p>
                            )}

                            <span className="wd-activity-date">
                              <i className="bi bi-clock me-1" />
                              {formatDate(activity.created_at)}
                            </span>
                          </div>

                          <div className="wd-activity-amount">
                            {formatCurrency(activity.grand_total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            {/* Quick overview */}
            <Col xs={12} xl={5}>
              <Card className="wd-panel h-100">
                <Card.Body>
                  <div className="wd-panel-heading">
                    <div>
                      <h4>Quick Overview</h4>
                      <p>Important reminders for your shift.</p>
                    </div>

                    <div className="wd-panel-heading-icon">
                      <i className="bi bi-lightning-charge" />
                    </div>
                  </div>

                  <div className="wd-reminder">
                    <span className="wd-reminder-icon products">
                      <i className="bi bi-box-seam" />
                    </span>

                    <div>
                      <strong>Check product availability</strong>
                      <p>
                        Review available products before processing orders.
                      </p>
                    </div>
                  </div>

                  <div className="wd-reminder">
                    <span className="wd-reminder-icon orders">
                      <i className="bi bi-bag-check" />
                    </span>

                    <div>
                      <strong>Review pending orders</strong>
                      <p>
                        {dashboard.summary.pendingOrders} orders are waiting
                        for worker action.
                      </p>
                    </div>
                  </div>

                  <div className="wd-reminder">
                    <span className="wd-reminder-icon activity">
                      <i className="bi bi-clock-history" />
                    </span>

                    <div>
                      <strong>Track your activity</strong>
                      <p>
                        Check your recent approvals and rejection history.
                      </p>
                    </div>
                  </div>

                  <div className="wd-shift-note">
                    <i className="bi bi-info-circle" />
                    <span>
                      Remember to verify product availability before
                      approving an order.
                    </span>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Container>
  );
}

export default WorkerDashboard;
