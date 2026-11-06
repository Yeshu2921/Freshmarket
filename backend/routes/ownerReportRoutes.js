const express = require("express");
const router = express.Router();

const {
  getReportSummary,
  getSalesReport,
  getBestSellingProducts,
  getLowStockProducts,
  getOrderStatusReport,
} = require("../controllers/ownerReportController");

const {
  requireAuth,
  requireOwner,
} = require("../middleware/authMiddleware");

// All reports are accessible to the owner only.
router.use(requireAuth);
router.use(requireOwner);

// Dashboard summary.
router.get("/summary", getReportSummary);

// Daily, weekly, and monthly sales.
router.get("/sales", getSalesReport);

// Best-selling products.
router.get("/best-selling", getBestSellingProducts);

// Low-stock products.
router.get("/low-stock", getLowStockProducts);

// Completed and rejected orders.
router.get("/orders", getOrderStatusReport);

module.exports = router;