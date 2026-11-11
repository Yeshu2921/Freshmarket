
const express = require("express");
const router = express.Router();

const {
  getAllOwnerOrders,
  getOwnerOrderDetails,
  getOwnerOrderReceipt,
  permanentlyDeleteOwnerOrder,
  resetCustomerPin,
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
// Reset the customer PIN associated with an order.
router.patch("/:orderId/reset-pin", resetCustomerPin);
// Get private payment receipt.
// Keep this route before the general order details route.
router.get("/:orderId/receipt", getOwnerOrderReceipt);

// Get one order with complete details.
router.get("/:orderId", getOwnerOrderDetails);

// Permanently delete an eligible order.
router.delete("/:orderId", permanentlyDeleteOwnerOrder);

module.exports = router;
