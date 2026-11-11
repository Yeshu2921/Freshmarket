
const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");

const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationCount,
} = require("../controllers/notificationController");

// All notification routes require login.
router.use(requireAuth);

// Get notifications.
router.get("/", getNotifications);

// Get unread count.
router.get("/unread-count", getNotificationCount);

// Mark all as read.
router.patch("/read-all", markAllNotificationsRead);

// Mark one as read.
router.patch("/:id/read", markNotificationRead);

module.exports = router;
