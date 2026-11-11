
require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const db = require("./db");

const { initializeSocket } = require("./socket/socketServer");

// ======================================================
// IMPORT ROUTES
// ======================================================

// Authentication and users
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

// Products, categories and brands
const brandRoutes = require("./routes/brandRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const customerProductRoutes = require(
  "./routes/customerProductRoutes"
);

// Customer orders and order history
const customerOrderRoutes = require(
  "./routes/customerOrderRoutes"
);
const customerOrderHistoryRoutes = require(
  "./routes/customerOrderHistoryRoutes"
);

// Worker and owner orders
const workerOrderRoutes = require(
  "./routes/workerOrderRoutes"
);
const ownerOrderRoutes = require(
  "./routes/ownerOrderRoutes"
);

// Dashboards and reports
const ownerReportRoutes = require(
  "./routes/ownerReportRoutes"
);
const ownerDashboardRoutes = require(
  "./routes/ownerDashboardRoutes"
);
const workerDashboardRoutes = require(
  "./routes/workerDashboardRoutes"
);

// Homepage management
const homepageRoutes = require(
  "./routes/homepageRoutes"
);

// Messaging and notifications
const messageRoutes = require(
  "./routes/messageRoutes"
);
const notificationRoutes = require(
  "./routes/notificationRoutes"
);

// ======================================================
// CREATE EXPRESS APPLICATION
// ======================================================

const app = express();

// ======================================================
// MIDDLEWARE
// ======================================================

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5133",
    credentials: true,
  })
);

// Parse JSON request bodies.
// Must be registered before API routes.
app.use(express.json({ limit: "1mb" }));

// Parse form-urlencoded request bodies.
app.use(express.urlencoded({ extended: true }));

// ======================================================
// UPLOAD DIRECTORIES
// ======================================================

// Public product image directory.
const uploadsDirectory = path.join(
  __dirname,
  "uploads"
);

const productUploadsDirectory = path.join(
  uploadsDirectory,
  "products"
);

// Private payment receipt directory.
// NEVER serve this directory using express.static().
const privateUploadsDirectory = path.join(
  __dirname,
  "private_uploads"
);

const customerReceiptDirectory = path.join(
  privateUploadsDirectory,
  "customer",
  "payment-receipts"
);

// Homepage image directory.
const publicDirectory = path.join(
  __dirname,
  "public"
);

const homepageImagesDirectory = path.join(
  publicDirectory,
  "images",
  "homepage"
);

// Create directories automatically if they do not exist.
fs.mkdirSync(productUploadsDirectory, {
  recursive: true,
});

fs.mkdirSync(customerReceiptDirectory, {
  recursive: true,
});

fs.mkdirSync(homepageImagesDirectory, {
  recursive: true,
});

// Private message attachment directories.
// The messageUpload middleware also creates these automatically.
const messageImagesDirectory = path.join(
  privateUploadsDirectory,
  "messages",
  "images"
);

const messageAudioDirectory = path.join(
  privateUploadsDirectory,
  "messages",
  "audio"
);

const messageVideosDirectory = path.join(
  privateUploadsDirectory,
  "messages",
  "videos"
);

[
  messageImagesDirectory,
  messageAudioDirectory,
  messageVideosDirectory,
].forEach((directory) => {
  fs.mkdirSync(directory, {
    recursive: true,
  });
});

// ======================================================
// PUBLIC STATIC FILES
// ======================================================

// Public product images:
// http://localhost:5134/uploads/products/image.jpg
app.use(
  "/uploads",
  express.static(uploadsDirectory)
);

// Public homepage images:
// http://localhost:5134/images/homepage/image.jpg
app.use(
  express.static(publicDirectory)
);

// IMPORTANT:
// Do not expose privateUploadsDirectory using express.static().
// Payment receipts and message attachments must be accessed
// through authenticated and authorized routes.

// ======================================================
// DATABASE HEALTH CHECK
// ======================================================

app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    return res.status(200).json({
      success: true,
      message: "FreshMart backend and database are connected.",
    });
  } catch (error) {
    console.error(
      "Health check failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

// ======================================================
// AUTHENTICATION AND USER MANAGEMENT
// ======================================================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);

// ======================================================
// CATEGORIES AND BRANDS
// ======================================================

app.use(
  "/api/brands",
  brandRoutes
);

app.use(
  "/api/categories",
  categoryRoutes
);

// ======================================================
// PRODUCT MANAGEMENT
// ======================================================

app.use(
  "/api/products",
  productRoutes
);

app.use(
  "/api/customer-products",
  customerProductRoutes
);

// ======================================================
// CUSTOMER ORDERS
// ======================================================

app.use(
  "/api/customer-orders",
  customerOrderRoutes
);

app.use(
  "/api/customer-orders",
  customerOrderHistoryRoutes
);

// ======================================================
// WORKER AND OWNER ORDERS
// ======================================================

// Worker order management:
// GET    /api/worker-orders
// GET    /api/worker-orders/sales-history
// GET    /api/worker-orders/:orderId
// GET    /api/worker-orders/:orderId/receipt
// POST   /api/worker-orders/:orderId/approve
// POST   /api/worker-orders/:orderId/reject
// DELETE /api/worker-orders/:orderId/rejected

app.use(
  "/api/worker-orders",
  workerOrderRoutes
);

// Owner order management:
// GET    /api/owner-orders
// GET    /api/owner-orders/:orderId
// GET    /api/owner-orders/:orderId/receipt
// DELETE /api/owner-orders/:orderId

app.use(
  "/api/owner-orders",
  ownerOrderRoutes
);

// ======================================================
// DASHBOARDS AND REPORTS
// ======================================================

app.use(
  "/api/owner-reports",
  ownerReportRoutes
);

app.use(
  "/api/owner-dashboard",
  ownerDashboardRoutes
);

app.use(
  "/api/worker-dashboard",
  workerDashboardRoutes
);

// ======================================================
// HOMEPAGE MANAGEMENT
// ======================================================

app.use(
  "/api/homepage",
  homepageRoutes
);

// ======================================================
// MESSAGING
// ======================================================

app.use(
  "/api/messages",
  messageRoutes
);

// ======================================================
// NOTIFICATIONS
// ======================================================

app.use(
  "/api/notifications",
  notificationRoutes
);

// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// ======================================================
// GENERAL ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {
  console.error(
    "Unhandled server error:",
    error.message
  );

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
});

// ======================================================
// CREATE HTTP SERVER FOR EXPRESS + SOCKET.IO
// ======================================================

const httpServer = http.createServer(app);

// Initialize Socket.IO on the same HTTP server.
initializeSocket(httpServer);

// ======================================================
// START SERVER
// ======================================================

const PORT = Number(process.env.PORT || 5134);

async function startServer() {
  try {
    // Verify MySQL connection before starting server.
    await db.query("SELECT 1");

    httpServer.listen(PORT, () => {
      console.log("--------------------------------------");
      console.log("       FRESHMART BACKEND STARTED");
      console.log("--------------------------------------");

      console.log(
        `Server: http://localhost:${PORT}`
      );

      console.log(
        `Health: http://localhost:${PORT}/api/health`
      );

      console.log(
        `Auth: http://localhost:${PORT}/api/auth`
      );

      console.log(
        `Users: http://localhost:${PORT}/api/users`
      );

      console.log(
        `Products: http://localhost:${PORT}/api/products`
      );

      console.log(
        `Customer Orders: http://localhost:${PORT}/api/customer-orders`
      );

      console.log(
        `Worker Orders: http://localhost:${PORT}/api/worker-orders`
      );

      console.log(
        `Owner Orders: http://localhost:${PORT}/api/owner-orders`
      );

      console.log(
        `Owner Reports: http://localhost:${PORT}/api/owner-reports`
      );

      console.log(
        `Homepage: http://localhost:${PORT}/api/homepage`
      );

      console.log(
        `Messages: http://localhost:${PORT}/api/messages`
      );

      console.log(
        `Notifications: http://localhost:${PORT}/api/notifications`
      );

      console.log("--------------------------------------");
      console.log("MySQL connection successful.");
      console.log("Socket.IO server initialized.");
      console.log("Private payment receipts protected.");
      console.log("Private message attachments protected.");
      console.log("--------------------------------------");
    });
  } catch (error) {
    console.error(
      "Unable to connect to MySQL:",
      error.message
    );

    process.exitCode = 1;
  }
}

startServer();

// ======================================================
// EXPORT APP (USEFUL FOR TESTING)
// ======================================================

module.exports = app;
