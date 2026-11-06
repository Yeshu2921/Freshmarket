const express = require("express");
const router = express.Router();

const {
  getAllOwnerOrders,
  getOwnerOrderDetails,
  permanentlyDeleteOwnerOrder,
} = require("../controllers/ownerOrderController");

const {
  requireAuth,
  requireOwner,
} = require("../middleware/authMiddleware");

// All routes in this file are owner-only.
router.use(requireAuth);
router.use(requireOwner);

// Get all orders.
router.get("/", getAllOwnerOrders);

// Get one order with complete details.
router.get("/:orderId", getOwnerOrderDetails);

// Permanently delete any order.
router.delete("/:orderId", permanentlyDeleteOwnerOrder);

module.exports = router;