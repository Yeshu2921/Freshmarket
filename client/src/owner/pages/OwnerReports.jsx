
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./OwnerReports.css";

const API_BASE = "http://localhost:5134/api";

const getLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDefaultStartDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return getLocalDate(date);
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const formatNumber = (number) =>
  new Intl.NumberFormat("en-ET").format(Number(number) || 0);

const unwrapData = (response) => {
  if (!response) return null;

  return (
    response.data ||
    response.summary ||
    response.report ||
    response
  );
};

const getArray = (response, possibleKeys = []) => {
  if (Array.isArray(response)) return response;

  for (const key of possibleKeys) {
    if (Array.isArray(response?.[key])) return response[key];
    if (Array.isArray(response?.data?.[key])) {
      return response.data[key];
    }
  }

  if (Array.isArray(response?.data)) return response.data;

  return [];
};

const getSalesValue = (item) =>
  Number(
    item.total_sales ??
      item.total_revenue ??
      item.sales ??
      item.revenue ??
      item.grand_total ??
      0
  );

const getSalesLabel = (item) =>
  item.period ??
  item.sales_date ??
  item.sale_date ??
  item.week_start ??
  item.month ??
  item.date ??
  "";

const OwnerReports = () => {
  const [summary, setSummary] = useState({});
  const [sales, setSales] = useState([]);
  const [bestSelling, setBestSelling] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [rejectedOrders, setRejectedOrders] = useState([]);

  const [period, setPeriod] = useState("daily");
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getLocalDate(new Date()));
  const [stockThreshold, setStockThreshold] = useState("10");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const getHeaders = () => {
    const token = sessionStorage.getItem("freshmartToken");

    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchReport = async (url) => {
    const response = await fetch(`${API_BASE}${url}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || `Request failed (${response.status})`
      );
    }

    return result;
  };

  const loadReports = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const params = new URLSearchParams({
          period,
          startDate,
          endDate,
        });

        const threshold = Math.max(
          0,
          Number.parseInt(stockThreshold, 10) || 0
        );

        const [
          summaryResult,
          salesResult,
          bestSellingResult,
          lowStockResult,
          completedResult,
          rejectedResult,
        ] = await Promise.all([
          fetchReport("/owner-reports/summary"),
          fetchReport(`/owner-reports/sales?${params.toString()}`),
          fetchReport(
            `/owner-reports/best-selling?startDate=${startDate}&endDate=${endDate}&limit=10`
          ),
          fetchReport(
            `/owner-reports/low-stock?threshold=${threshold}`
          ),
          fetchReport(
            `/owner-reports/orders?status=Delivered&startDate=${startDate}&endDate=${endDate}`
          ),
          fetchReport(
            `/owner-reports/orders?status=Rejected&startDate=${startDate}&endDate=${endDate}`
          ),
        ]);

        const summaryData = unwrapData(summaryResult);

        setSummary(
          summaryData?.summary ||
            summaryData?.report ||
            summaryData ||
            {}
        );

        setSales(
          getArray(salesResult, ["sales", "records", "results"])
        );

        setBestSelling(
          getArray(bestSellingResult, [
            "products",
            "bestSelling",
            "results",
          ])
        );

        setLowStock(
          getArray(lowStockResult, [
            "products",
            "lowStock",
            "results",
          ])
        );

        setCompletedOrders(
          getArray(completedResult, ["orders", "results"])
        );

        setRejectedOrders(
          getArray(rejectedResult, ["orders", "results"])
        );
      } catch (err) {
        console.error("Owner reports error:", err);
        setError(
          err.message ||
            "Unable to load reports. Please check your connection and try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period, startDate, endDate, stockThreshold]
  );

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const chartData = useMemo(() => {
    return sales.map((item) => ({
      label: getSalesLabel(item),
      sales: getSalesValue(item),
      orders: Number(item.order_count ?? item.total_orders ?? 0),
    }));
  }, [sales]);

  const totalChartSales = useMemo(
    () => chartData.reduce((total, item) => total + item.sales, 0),
    [chartData]
  );

  const completedCount = completedOrders.length;
  const rejectedCount = rejectedOrders.length;

  const getSummaryValue = (...keys) => {
    for (const key of keys) {
      if (summary[key] !== undefined && summary[key] !== null) {
        return summary[key];
      }
    }
    return 0;
  };

  const todaySales = getSummaryValue(
    "today_sales",
    "todaySales",
    "today_revenue",
    "todayRevenue"
  );

  const monthSales = getSummaryValue(
    "month_sales",
    "monthSales",
    "monthly_sales",
    "monthlyRevenue"
  );

  const summaryCompleted = getSummaryValue(
    "completed_orders",
    "completedOrders",
    "delivered_orders",
    "deliveredOrders"
  );

  const summaryRejected = getSummaryValue(
    "rejected_orders",
    "rejectedOrders"
  );

  const summaryPending = getSummaryValue(
    "pending_orders",
    "pendingOrders"
  );

  const getProductName = (product) =>
    product.product_name || product.name || "Unknown product";

  const getProductQuantity = (product) =>
    Number(
      product.total_quantity ??
        product.quantity_sold ??
        product.quantity ??
        0
    );

  const getProductSales = (product) =>
    Number(
      product.total_sales ??
        product.total_revenue ??
        product.revenue ??
        product.line_total ??
        0
    );

  const getOrderDate = (order) => {
    const date = order.created_at || order.order_date;
    if (!date) return "—";

    return new Date(date).toLocaleDateString();
  };

  const getOrderNumber = (order) =>
    order.order_number || `Order #${order.id}`;

  const getOrderTotal = (order) =>
    Number(order.grand_total ?? order.total_amount ?? 0);

  const handleDateChange = (setter, value) => {
    setter(value);
  };

  const handleRefresh = () => {
    loadReports(true);
  };

  if (loading) {
    return (
      <div className="owner-reports-loading">
        <Spinner animation="border" variant="success" />
        <p>Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="owner-reports-page">
      <div className="owner-reports-header">
        <div>
          <div className="owner-reports-eyebrow">
            FRESHMART MANAGEMENT
          </div>
          <h2>Reports & Analytics</h2>
          <p>
            Monitor sales performance, product demand, stock levels,
            and order activity.
          </p>
        </div>

        <Button
          variant="success"
          className="reports-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Spinner size="sm" animation="border" />
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
        </Alert>
      )}

      {/* Summary cards */}
      <Row className="g-3 reports-summary-row">
        <Col xs={12} sm={6} xl={3}>
          <Card className="reports-stat-card">
            <Card.Body>
              <div className="reports-stat-top">
                <span>Today's Sales</span>
                <div className="reports-stat-icon sales-icon">
                  <i className="bi bi-cash-stack" />
                </div>
              </div>
              <h3>{formatCurrency(todaySales)}</h3>
              <small>Revenue from delivered orders</small>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="reports-stat-card">
            <Card.Body>
              <div className="reports-stat-top">
                <span>This Month's Sales</span>
                <div className="reports-stat-icon month-icon">
                  <i className="bi bi-calendar-month" />
                </div>
              </div>
              <h3>{formatCurrency(monthSales)}</h3>
              <small>Revenue from delivered orders</small>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="reports-stat-card">
            <Card.Body>
              <div className="reports-stat-top">
                <span>Completed Orders</span>
                <div className="reports-stat-icon completed-icon">
                  <i className="bi bi-bag-check" />
                </div>
              </div>
              <h3>{formatNumber(summaryCompleted)}</h3>
              <small>Delivered orders</small>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} xl={3}>
          <Card className="reports-stat-card">
            <Card.Body>
              <div className="reports-stat-top">
                <span>Rejected Orders</span>
                <div className="reports-stat-icon rejected-icon">
                  <i className="bi bi-bag-x" />
                </div>
              </div>
              <h3>{formatNumber(summaryRejected)}</h3>
              <small>Orders rejected by workers</small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Sales chart */}
      <Card className="reports-section-card">
        <Card.Body>
          <div className="reports-section-heading">
            <div>
              <h5>Sales Performance</h5>
              <p>Compare sales over your selected date range.</p>
            </div>

            <div className="reports-period-buttons">
              {["daily", "weekly", "monthly"].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={period === value ? "success" : "light"}
                  className={period === value ? "active-period" : ""}
                  onClick={() => setPeriod(value)}
                >
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <Row className="reports-filter-row g-3 align-items-end">
            <Col xs={12} sm={5} md={4}>
              <Form.Label>Start date</Form.Label>
              <Form.Control
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) =>
                  handleDateChange(setStartDate, e.target.value)
                }
              />
            </Col>

            <Col xs={12} sm={5} md={4}>
              <Form.Label>End date</Form.Label>
              <Form.Control
                type="date"
                value={endDate}
                min={startDate}
                max={getLocalDate(new Date())}
                onChange={(e) =>
                  handleDateChange(setEndDate, e.target.value)
                }
              />
            </Col>

            <Col xs={12} sm={2} md={4}>
              <div className="reports-chart-total">
                <small>Sales in selected range</small>
                <strong>{formatCurrency(totalChartSales)}</strong>
              </div>
            </Col>
          </Row>

          <div className="reports-chart-container">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 12,
                    right: 12,
                    left: 4,
                    bottom: 8,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="freshMartSalesGradient"
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
                    stroke="#e9ecef"
                  />

                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6c757d" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={20}
                  />

                  <YAxis
                    tick={{ fontSize: 11, fill: "#6c757d" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      value >= 1000
                        ? `${(value / 1000).toFixed(0)}k`
                        : value
                    }
                  />

                  <Tooltip
                    formatter={(value) => [
                      formatCurrency(value),
                      "Sales",
                    ]}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e9ecef",
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#198754"
                    strokeWidth={3}
                    fill="url(#freshMartSalesGradient)"
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="reports-empty-state">
                <i className="bi bi-bar-chart-line" />
                <h6>No sales data found</h6>
                <p>
                  Delivered orders will appear here when they exist
                  within the selected date range.
                </p>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* Best selling and low stock */}
      <Row className="g-3 reports-data-row">
        <Col xs={12} xl={7}>
          <Card className="reports-section-card h-100">
            <Card.Body>
              <div className="reports-section-heading">
                <div>
                  <h5>Best-Selling Products</h5>
                  <p>Top products by delivered order quantity.</p>
                </div>
                <Badge bg="success" className="reports-count-badge">
                  {bestSelling.length} products
                </Badge>
              </div>

              <div className="table-responsive">
                <Table hover className="reports-table align-middle">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity Sold</th>
                      <th>Total Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestSelling.length > 0 ? (
                      bestSelling.map((product, index) => (
                        <tr key={product.product_id || index}>
                          <td>
                            <div className="reports-product-name">
                              <span className="reports-rank">
                                {index + 1}
                              </span>
                              <span>{getProductName(product)}</span>
                            </div>
                          </td>
                          <td>
                            {formatNumber(getProductQuantity(product))}
                          </td>
                          <td className="reports-money-cell">
                            {formatCurrency(getProductSales(product))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3">
                          <div className="reports-table-empty">
                            No best-selling products found.
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
          <Card className="reports-section-card h-100">
            <Card.Body>
              <div className="reports-section-heading">
                <div>
                  <h5>Low-Stock Products</h5>
                  <p>Products that need stock attention.</p>
                </div>
                <Badge bg="warning" text="dark">
                  {lowStock.length} items
                </Badge>
              </div>

              <Form.Group className="reports-threshold-control">
                <Form.Label>Low-stock threshold</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  value={stockThreshold}
                  onChange={(e) => setStockThreshold(e.target.value)}
                  onBlur={() => {
                    if (stockThreshold === "") setStockThreshold("10");
                  }}
                />
                <Form.Text>
                  Products with this quantity or less are listed.
                </Form.Text>
              </Form.Group>

              <div className="reports-low-stock-list">
                {lowStock.length > 0 ? (
                  lowStock.map((product) => {
                    const quantity = Number(product.quantity || 0);

                    return (
                      <div
                        className="reports-stock-item"
                        key={product.id}
                      >
                        <div className="reports-stock-product">
                          <strong>
                            {product.name || product.product_name}
                          </strong>
                          <small>
                            {product.category_name || "Uncategorized"}
                          </small>
                        </div>

                        <Badge
                          bg={quantity === 0 ? "danger" : "warning"}
                          text={quantity === 0 ? "light" : "dark"}
                        >
                          {quantity} left
                        </Badge>
                      </div>
                    );
                  })
                ) : (
                  <div className="reports-table-empty">
                    <i className="bi bi-check-circle me-2" />
                    No low-stock products found.
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Order reports */}
      <Row className="g-3 reports-order-row">
        <Col xs={12} xl={6}>
          <Card className="reports-section-card h-100">
            <Card.Body>
              <div className="reports-section-heading">
                <div>
                  <h5>Completed Orders</h5>
                  <p>Delivered orders in the selected date range.</p>
                </div>
                <Badge bg="success">{completedCount}</Badge>
              </div>

              <div className="table-responsive">
                <Table hover className="reports-table align-middle">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedOrders.length > 0 ? (
                      completedOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="reports-order-number">
                            {getOrderNumber(order)}
                          </td>
                          <td>{getOrderDate(order)}</td>
                          <td>{formatCurrency(getOrderTotal(order))}</td>
                          <td>
                            <Badge bg="success">Delivered</Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">
                          <div className="reports-table-empty">
                            No completed orders found.
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

        <Col xs={12} xl={6}>
          <Card className="reports-section-card h-100">
            <Card.Body>
              <div className="reports-section-heading">
                <div>
                  <h5>Rejected Orders</h5>
                  <p>Orders rejected by workers in this date range.</p>
                </div>
                <Badge bg="danger">{rejectedCount}</Badge>
              </div>

              <div className="table-responsive">
                <Table hover className="reports-table align-middle">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejectedOrders.length > 0 ? (
                      rejectedOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="reports-order-number">
                            {getOrderNumber(order)}
                          </td>
                          <td>{getOrderDate(order)}</td>
                          <td>{formatCurrency(getOrderTotal(order))}</td>
                          <td className="reports-rejection-reason">
                            {order.rejection_reason ||
                              order.reason ||
                              "Not provided"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4">
                          <div className="reports-table-empty">
                            No rejected orders found.
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
      </Row>

      <div className="reports-footer-note">
        <i className="bi bi-info-circle me-2" />
        Sales revenue and best-selling product totals are calculated
        from delivered orders only. Pending and rejected orders are
        not counted as sales.
      </div>
    </div>
  );
};

export default OwnerReports;
