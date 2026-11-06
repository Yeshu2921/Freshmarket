
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const db = require("./db");

// Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const brandRoutes = require("./routes/brandRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const customerProductRoutes = require("./routes/customerProductRoutes");
const customerOrderRoutes = require("./routes/customerOrderRoutes");
const customerOrderHistoryRoutes = require(
  "./routes/customerOrderHistoryRoutes"
);
const workerOrderRoutes = require("./routes/workerOrderRoutes");
const ownerOrderRoutes = require("./routes/ownerOrderRoutes");
const ownerReportRoutes = require("./routes/ownerReportRoutes");
const ownerDashboardRoutes = require("./routes/ownerDashboardRoutes");
const workerDashboardRoutes = require("./routes/workerDashboardRoutes");
const homepageRoutes = require("./routes/homepageRoutes");

// Create Express application FIRST.
const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5133",
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist.
const uploadsDirectory = path.join(__dirname, "uploads");
const productUploadsDirectory = path.join(
  uploadsDirectory,
  "products"
);

fs.mkdirSync(productUploadsDirectory, { recursive: true });

// Serve uploaded product images.
app.use("/uploads", express.static(uploadsDirectory));

// Serve homepage images from backend/public.
const publicDirectory = path.join(__dirname, "public");

fs.mkdirSync(
  path.join(publicDirectory, "images", "homepage"),
  { recursive: true }
);

app.use(express.static(publicDirectory));

// Database health check.
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    return res.json({
      success: true,
      message: "FreshMart backend and database are connected.",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

// Authentication and profile.
app.use("/api/auth", authRoutes);

// User management.
app.use("/api/users", userRoutes);

// Categories and brands.
app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);

// Product management.
app.use("/api/products", productRoutes);
app.use("/api/customer-products", customerProductRoutes);

// Customer orders.
app.use("/api/customer-orders", customerOrderRoutes);
app.use("/api/customer-orders", customerOrderHistoryRoutes);

// Worker and owner orders.
app.use("/api/worker-orders", workerOrderRoutes);
app.use("/api/owner-orders", ownerOrderRoutes);

// Dashboards and reports.
app.use("/api/owner-reports", ownerReportRoutes);
app.use("/api/owner-dashboard", ownerDashboardRoutes);
app.use("/api/worker-dashboard", workerDashboardRoutes);

// Homepage banner and gallery management.
app.use("/api/homepage", homepageRoutes);

// 404 handler.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// General error handler.
app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
});

const PORT = Number(process.env.PORT || 5134);

async function startServer() {
  try {
    await db.query("SELECT 1");

    app.listen(PORT, () => {
      console.log(`FreshMart backend running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Authentication: http://localhost:${PORT}/api/auth`);
      console.log(`User Management: http://localhost:${PORT}/api/users`);
      console.log(`Products: http://localhost:${PORT}/api/products`);
      console.log(`Homepage: http://localhost:${PORT}/api/homepage`);
    });
  } catch (error) {
    console.error("Unable to connect to MySQL:", error.message);
    process.exitCode = 1;
  }
}

startServer();
