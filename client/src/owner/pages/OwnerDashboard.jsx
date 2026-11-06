
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import "./OwnerDashboard.css";

const API_BASE = "http://localhost:5134/api";

const STATUS_COLORS = {
  Pending: "#f0ad4e",
  Confirmed: "#0d6efd",
  Preparing: "#7952b3",
  Ready: "#20a4a9",
  "Out for Delivery": "#6f42c1",
  Delivered: "#198754",
  Rejected: "#dc3545",
  Cancelled: "#6c757d",
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const formatNumber = (number) =>
  new Intl.NumberFormat("en-ET").format(Number(number) || 0);

function OwnerDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const token = sessionStorage.getItem("freshmartToken");

      const response = await fetch(`${API_BASE}/owner-dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.message || "Unable to load dashboard information."
        );
      }

      setDashboard(result.dashboard);
    } catch (err) {
      console.error("Owner dashboard error:", err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const summary = dashboard?.summary || {};

  const salesTrend = useMemo(
    () => dashboard?.salesTrend || [],
    [dashboard]
  );

  const orderStatus = useMemo(
    () => dashboard?.orderStatus || [],
    [dashboard]
  );

  const recentOrders = useMemo(
    () => dashboard?.recentOrders || [],
    [dashboard]
  );

  const lowStockProducts = useMemo(
    () => dashboard?.lowStockProducts || [],
    [dashboard]
  );

  const totalOrders = orderStatus.reduce(
    (total, item) => total + Number(item.count || 0),
    0
  );

  const chartColors = orderStatus.map(
    (item) => STATUS_COLORS[item.status] || "#adb5bd"
  );

  const getOrderStatusColor = (status) =>
    STATUS_COLORS[status] || "#6c757d";

  const getOrderDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-ET", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="owner-dashboard-loading">
        <Spinner animation="border" variant="success" />
        <p>Loading your supermarket dashboard...</p>
      </div>
    );
  }

  return (
    <div className="owner-dashboard">
      {/* Dashboard heading */}
      <div className="owner-dashboard-header">
        <div>
          <span className="owner-dashboard-label">
            FRESHMART MANAGEMENT
          </span>

          <h2>Dashboard Overview</h2>

          <p>
            Welcome back! Here is what's happening in your supermarket.
          </p>
        </div>

        <Button
          variant="success"
          className="owner-dashboard-refresh"
          onClick={() => fetchDashboard(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <i className="bi bi-arrow-clockwise me-2" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => setError("")}
        >
          {error}
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => fetchDashboard()}
            >
              Try again
            </Button>
          </div>
        </Alert>
      )}

      {/* Summary cards */}
      <Row className="g-3 owner-dashboard-summary">
        <Col xs={12} sm={6} xl={3}>
          <Card className="dashboard-stat-card">
            <Card.Body>
              <div className="dashboard-stat-top">
                <span>Total Products</span>
                <div className="dashboard-stat-icon products">
                  <i className="bi bi-box-seam" />
                </div>
              </div>

              <h3>{formatNumber(summary.totalProducts)}</h3>

              <p>Active products in catalog</p>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="dashboard-stat-card">
            <Card.Body>
              <div className="dashboard-stat-top">
                <span>Today's Sales</span>
                <div className="dashboard-stat-icon sales">
                  <i className="bi bi-cash-stack" />
                </div>
              </div>

              <h3>{formatCurrency(summary.todaySales)}</h3>

              <p>Revenue from delivered orders</p>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="dashboard-stat-card">
            <Card.Body>
              <div className="dashboard-stat-top">
                <span>Total Users</span>
                <div className="dashboard-stat-icon users">
                  <i className="bi bi-people" />
                </div>
              </div>

              <h3>{formatNumber(summary.totalUsers)}</h3>

              <p>Owner and worker accounts</p>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="dashboard-stat-card">
            <Card.Body>
              <div className="dashboard-stat-top">
                <span>Low Stock Items</span>
                <div className="dashboard-stat-icon stock">
                  <i className="bi bi-exclamation-triangle" />
                </div>
              </div>

              <h3>{formatNumber(summary.lowStockItems)}</h3>

              <p>Products needing attention</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Sales trend and order distribution */}
      <Row className="g-3 owner-dashboard-charts">
        <Col xs={12} xl={8}>
          <Card className="dashboard-panel h-100">
            <Card.Body>
              <div className="dashboard-panel-heading">
                <div>
                  <h5>Sales Overview</h5>
                  <p>Daily sales performance over the last 7 days</p>
                </div>

                <div className="dashboard-heading-icon">
                  <i className="bi bi-graph-up-arrow" />
                </div>
              </div>

              <div className="dashboard-sales-highlight">
                <span>Sales this week</span>
                <strong>{formatCurrency(summary.weekSales)}</strong>
              </div>

              <div className="dashboard-sales-chart">
                {salesTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={salesTrend}
                      margin={{
                        top: 12,
                        right: 12,
                        left: 0,
                        bottom: 5,
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="dashboardSalesGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#198754"
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="95%"
                            stopColor="#198754"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#edf0f2"
                      />

                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#7b858d" }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <YAxis
                        tick={{ fontSize: 11, fill: "#7b858d" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) =>
                          value >= 1000
                            ? `${(value / 1000).toFixed(1)}k`
                            : value
                        }
                      />

                      <Tooltip
                        formatter={(value) => [
                          formatCurrency(value),
                          "Sales",
                        ]}
                        contentStyle={{
                          borderRadius: 9,
                          border: "1px solid #e9ecef",
                        }}
                      />

                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke="#198754"
                        strokeWidth={3}
                        fill="url(#dashboardSalesGradient)"
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="dashboard-chart-empty">
                    <i className="bi bi-graph-up" />
                    <span>No sales data available yet.</span>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} xl={4}>
          <Card className="dashboard-panel h-100">
            <Card.Body>
              <div className="dashboard-panel-heading">
                <div>
                  <h5>Order Status</h5>
                  <p>Distribution of customer orders</p>
                </div>

                <div className="dashboard-heading-icon">
                  <i className="bi bi-pie-chart" />
                </div>
              </div>

              <div className="dashboard-pie-container">
                {totalOrders > 0 ? (
                  <div className="dashboard-pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orderStatus}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          innerRadius="58%"
                          outerRadius="82%"
                          paddingAngle={3}
                          stroke="none"
                        >
                          {orderStatus.map((item, index) => (
                            <Cell
                              key={`${item.status}-${index}`}
                              fill={chartColors[index]}
                            />
                          ))}
                        </Pie>

                        <Tooltip
                          formatter={(value, name) => [
                            `${formatNumber(value)} orders`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="dashboard-pie-center">
                      <strong>{formatNumber(totalOrders)}</strong>
                      <span>Total Orders</span>
                    </div>
                  </div>
                ) : (
                  <div className="dashboard-chart-empty">
                    <i className="bi bi-pie-chart" />
                    <span>No order data available yet.</span>
                  </div>
                )}
              </div>

              <div className="dashboard-status-legend">
                {orderStatus.map((item, index) => (
                  <div
                    className="dashboard-status-item"
                    key={`${item.status}-${index}`}
                  >
                    <span
                      className="dashboard-status-dot"
                      style={{ backgroundColor: chartColors[index] }}
                    />
                    <span className="dashboard-status-name">
                      {item.status}
                    </span>
                    <strong>{formatNumber(item.count)}</strong>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Recent orders and low stock */}
      <Row className="g-3 owner-dashboard-bottom">
        <Col xs={12} xl={7}>
          <Card className="dashboard-panel h-100">
            <Card.Body>
              <div className="dashboard-panel-heading">
                <div>
                  <h5>Recent Orders</h5>
                  <p>Latest customer order activity</p>
                </div>

                <div className="dashboard-heading-icon">
                  <i className="bi bi-receipt" />
                </div>
              </div>

              <div className="table-responsive">
                <Table hover className="dashboard-table align-middle">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentOrders.length > 0 ? (
                      recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="dashboard-order-number">
                            {order.order_number || `#${order.id}`}
                          </td>

                          <td>{getOrderDate(order.created_at)}</td>

                          <td className="dashboard-order-amount">
                            {formatCurrency(order.grand_total)}
                          </td>

                          <td>
                            <Badge
                              className="dashboard-order-badge"
                              style={{
                                backgroundColor: getOrderStatusColor(
                                  order.order_status
                                ),
                              }}
                            >
                              {order.order_status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">
                          <div className="dashboard-empty-message">
                            <i className="bi bi-inbox" />
                            <span>No customer orders yet.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} xl={5}>
          <Card className="dashboard-panel h-100">
            <Card.Body>
              <div className="dashboard-panel-heading">
                <div>
                  <h5>Stock Alerts</h5>
                  <p>Products with 10 or fewer items remaining</p>
                </div>

                <div className="dashboard-heading-icon warning">
                  <i className="bi bi-exclamation-triangle" />
                </div>
              </div>

              <div className="dashboard-stock-list">
                {lowStockProducts.length > 0 ? (
                  lowStockProducts.map((product) => (
                    <div
                      className="dashboard-stock-item"
                      key={product.id}
                    >
                      <div className="dashboard-stock-icon">
                        <i className="bi bi-box-seam" />
                      </div>

                      <div className="dashboard-stock-info">
                        <strong>{product.name}</strong>
                        <span>
                          {product.category_name || "Uncategorized"}
                        </span>
                      </div>

                      <Badge
                        bg={Number(product.quantity) === 0 ? "danger" : "warning"}
                        text={Number(product.quantity) === 0 ? "light" : "dark"}
                      >
                        {formatNumber(product.quantity)} left
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="dashboard-empty-message">
                    <i className="bi bi-check-circle" />
                    <span>No low-stock products. Good job!</span>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <div className="dashboard-data-note">
        <i className="bi bi-info-circle" />
        <span>
          Sales figures include delivered orders only. Pending,
          rejected, and cancelled orders are not counted as revenue.
        </span>
      </div>
    </div>
  );
}

export default OwnerDashboard;
