
const express = require("express");
const router = express.Router();

const {
  getWorkerDashboard,
} = require("../controllers/workerDashboardController");

const {
  requireAuth,
} = require("../middleware/authMiddleware");

router.use(requireAuth);

router.get("/", getWorkerDashboard);

module.exports = router;
