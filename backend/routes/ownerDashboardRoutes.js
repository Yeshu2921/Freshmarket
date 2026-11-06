
const express = require("express");
const router = express.Router();

const {
  getOwnerDashboard,
} = require("../controllers/ownerDashboardController");

const {
  requireAuth,
  requireOwner,
} = require("../middleware/authMiddleware");

router.use(requireAuth);
router.use(requireOwner);

router.get("/", getOwnerDashboard);

module.exports = router;
