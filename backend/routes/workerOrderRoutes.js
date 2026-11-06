
const express = require("express");
const router = express.Router();

const {
  getWorkerOrders,
  getWorkerOrderDetails,
  approveOrder,
  rejectOrder,
  getWorkerSalesHistory,
  deleteRejectedOrder,
} = require("../controllers/workerOrderController");

const {
  requireAuth,
  requireOwnerOrWorker,
} = require("../middleware/authMiddleware");

// All routes require an authenticated owner or worker.
router.use(requireAuth);
router.use(requireOwnerOrWorker);

// GET /api/worker-orders
router.get("/", getWorkerOrders);

// IMPORTANT: Keep this before /:orderId.
router.get("/sales-history", getWorkerSalesHistory);

// GET /api/worker-orders/:orderId
router.get("/:orderId", getWorkerOrderDetails);

// POST /api/worker-orders/:orderId/approve
router.post("/:orderId/approve", approveOrder);

// POST /api/worker-orders/:orderId/reject
router.post("/:orderId/reject", rejectOrder);

// DELETE /api/worker-orders/:orderId/rejected
router.delete("/:orderId/rejected", deleteRejectedOrder);

module.exports = router;
