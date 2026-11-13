
const db = require("../db");
const { emitToUser } = require("../socket/socketServer");

// =============================================
// GENERATE NOTIFICATION ID (TiDB CLOUD)
// =============================================

async function generateNotificationId() {
  const [result] = await db.execute(
    "INSERT INTO notification_id_generator () VALUES ()"
  );

  return result.insertId;
}

// =============================================
// CREATE AND SAVE A NOTIFICATION
// =============================================

async function createNotification({
  userId,
  type,
  title,
  message,
  referenceId = null,
}) {
  const allowedTypes = [
    "new_order",
    "new_message",
    "order_update",
  ];

  if (!allowedTypes.includes(type)) {
    throw new Error("Invalid notification type.");
  }

  // Generate a unique ID using the separate generator table.
  const notificationId = await generateNotificationId();

  // Save notification with the generated ID.
  await db.execute(
    `
    INSERT INTO notifications (
      id,
      user_id,
      notification_type,
      title,
      message,
      reference_id
    )
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      notificationId,
      userId,
      type,
      title,
      message,
      referenceId,
    ]
  );

  const notification = {
    id: notificationId,
    user_id: userId,
    notification_type: type,
    title,
    message,
    reference_id: referenceId,
    is_read: 0,
    created_at: new Date(),
  };

  // Deliver immediately if the user is connected.
  // Socket errors must not affect the saved notification.
  try {
    emitToUser(userId, "notification:new", notification);
  } catch (socketError) {
    console.error(
      "Notification socket delivery error:",
      socketError.message
    );
  }

  return notification;
}

// =============================================
// GET MY NOTIFICATIONS
// =============================================

async function getNotifications(req, res) {
  try {
    const userId = req.user.id;

    const [notifications] = await db.execute(
      `
      SELECT
        id,
        notification_type,
        title,
        message,
        reference_id,
        is_read,
        created_at,
        read_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50
      `,
      [userId]
    );

    const [countRows] = await db.execute(
      `
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_id = ?
        AND is_read = 0
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount: Number(countRows[0].unread_count),
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to load notifications.",
    });
  }
}

// =============================================
// MARK ONE NOTIFICATION AS READ
// =============================================

async function markNotificationRead(req, res) {
  try {
    const userId = req.user.id;
    const notificationId = Number(req.params.id);

    if (
      !Number.isSafeInteger(notificationId) ||
      notificationId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const [result] = await db.execute(
      `
      UPDATE notifications
      SET is_read = 1,
          read_at = COALESCE(read_at, NOW())
      WHERE id = ?
        AND user_id = ?
      `,
      [notificationId, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    const unreadCount = await getUnreadCount(userId);

    try {
      emitToUser(userId, "notification:count", {
        unreadCount,
      });
    } catch (socketError) {
      console.error(
        "Notification count socket error:",
        socketError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      unreadCount,
    });
  } catch (error) {
    console.error("Mark notification read error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update notification.",
    });
  }
}

// =============================================
// MARK ALL NOTIFICATIONS AS READ
// =============================================

async function markAllNotificationsRead(req, res) {
  try {
    const userId = req.user.id;

    await db.execute(
      `
      UPDATE notifications
      SET is_read = 1,
          read_at = COALESCE(read_at, NOW())
      WHERE user_id = ?
        AND is_read = 0
      `,
      [userId]
    );

    try {
      emitToUser(userId, "notification:count", {
        unreadCount: 0,
      });
    } catch (socketError) {
      console.error(
        "Notification count socket error:",
        socketError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      unreadCount: 0,
    });
  } catch (error) {
    console.error("Mark all notifications error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications.",
    });
  }
}

// =============================================
// GET UNREAD COUNT
// =============================================

async function getUnreadCount(userId) {
  const [rows] = await db.execute(
    `
    SELECT COUNT(*) AS unread_count
    FROM notifications
    WHERE user_id = ?
      AND is_read = 0
    `,
    [userId]
  );

  return Number(rows[0].unread_count);
}

// =============================================
// GET NOTIFICATION COUNT
// =============================================

async function getNotificationCount(req, res) {
  try {
    const unreadCount = await getUnreadCount(req.user.id);

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Notification count error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to load unread count.",
    });
  }
}

// =============================================
// EXPORTS
// =============================================

module.exports = {
  createNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationCount,
  getUnreadCount,
};
