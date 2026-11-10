
const express = require("express");
const router = express.Router();

const {
  getWorkerOrders,
  getWorkerOrderDetails,
  getWorkerOrderReceipt,
  approveOrder,
  rejectOrder,
  getWorkerSalesHistory,
  deleteRejectedOrder,
} = require("../controllers/workerOrderController");

const {
  requireAuth,
  requireOwnerOrWorker,
} = require("../middleware/authMiddleware");

// All routes require authentication.
// Both owner and worker can view orders and receipts.
// Controller functions restrict approval, rejection and deletion
// to workers only.
router.use(requireAuth);
router.use(requireOwnerOrWorker);

// GET /api/worker-orders
router.get("/", getWorkerOrders);

// IMPORTANT: Keep this before /:orderId.
// GET /api/worker-orders/sales-history
router.get("/sales-history", getWorkerSalesHistory);

// IMPORTANT: Keep receipt route before general order details.
// GET /api/worker-orders/:orderId/receipt
router.get("/:orderId/receipt", getWorkerOrderReceipt);

// GET /api/worker-orders/:orderId
router.get("/:orderId", getWorkerOrderDetails);

// POST /api/worker-orders/:orderId/approve
router.post("/:orderId/approve", approveOrder);

// POST /api/worker-orders/:orderId/reject
router.post("/:orderId/reject", rejectOrder);

// DELETE /api/worker-orders/:orderId/rejected
router.delete("/:orderId/rejected", deleteRejectedOrder);

module.exports = router;
