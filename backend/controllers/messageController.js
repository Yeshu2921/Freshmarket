
const db = require("../db");
const path = require("path");
const fs = require("fs");
const { emitToUser } = require("../socket/socketServer");
const { createNotification } = require("./notificationController");

const BACKEND_ROOT = path.join(__dirname, "..");
const MESSAGE_UPLOAD_ROOT = path.join(
  BACKEND_ROOT,
  "private_uploads",
  "messages"
);

// =============================================
// HELPERS
// =============================================

function handleError(res, error, message) {
  console.error("Message Controller Error:", error);

  return res.status(500).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" && {
      error: error.message,
    }),
  });
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function removeUploadedFile(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

function attachmentUrl(messageId, deletedAt) {
  if (deletedAt) return null;
  return `/api/messages/${messageId}/attachment`;
}

async function getConversationUsers(conversationId) {
  const [rows] = await db.execute(
    `SELECT user_id
     FROM conversation_participants
     WHERE conversation_id = ?`,
    [conversationId]
  );

  return rows.map((row) => row.user_id);
}

async function emitToConversation(conversationId, event, data) {
  const userIds = await getConversationUsers(conversationId);

  userIds.forEach((userId) => {
    emitToUser(userId, event, data);
  });
}

async function getFormattedMessage(messageId, currentUserId) {
  const [rows] = await db.execute(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.sender_id,
      sender.first_name AS sender_first_name,
      sender.last_name AS sender_last_name,
      sender.profile_image AS sender_profile_image,
      m.message_type,
      CASE
        WHEN m.deleted_for_everyone_at IS NOT NULL
          THEN 'This message was deleted'
        ELSE m.message_text
      END AS message_text,
      m.attachment_name,
      m.attachment_mime,
      m.attachment_size,
      m.edited_at,
      m.deleted_for_everyone_at,
      m.created_at,
      m.attachment_path,
      CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM messages m
    INNER JOIN users sender ON sender.id = m.sender_id
    WHERE m.id = ?
    LIMIT 1
    `,
    [currentUserId, messageId]
  );

  if (!rows.length) return null;

  const message = rows[0];

  const formatted = {
    ...message,
    attachment_url: attachmentUrl(
      message.id,
      message.deleted_for_everyone_at
    ),
  };

  delete formatted.attachment_path;

  if (message.deleted_for_everyone_at) {
    formatted.attachment_name = null;
    formatted.attachment_mime = null;
    formatted.attachment_size = null;
  }

  return formatted;
}

// =============================================
// 1. GET CONTACT LIST
// =============================================

async function getContacts(req, res) {
  try {
    const currentUserId = req.user.id;

    const [contacts] = await db.execute(
      `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.profile_image,
        c.id AS conversation_id,

        (
          SELECT
            CASE
              WHEN m.deleted_for_everyone_at IS NOT NULL
                THEN 'This message was deleted'
              WHEN m.message_type <> 'text'
                THEN CONCAT(
                  UPPER(LEFT(m.message_type, 1)),
                  SUBSTRING(m.message_type, 2)
                )
              ELSE COALESCE(m.message_text, '')
            END
          FROM messages m
          WHERE m.conversation_id = c.id
            AND NOT EXISTS (
              SELECT 1
              FROM message_deletions md
              WHERE md.message_id = m.id
                AND md.user_id = ?
            )
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message,

        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_id <> ?
            AND m.created_at > COALESCE(
              my_cp.last_read_at,
              '1970-01-01 00:00:00'
            )
            AND m.deleted_for_everyone_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM message_deletions md
              WHERE md.message_id = m.id
                AND md.user_id = ?
            )
        ) AS unread_count

      FROM users u

      LEFT JOIN (
        SELECT
          cp2.user_id AS other_user_id,
          MAX(cp1.conversation_id) AS conversation_id

        FROM conversation_participants cp1

        INNER JOIN conversation_participants cp2
          ON cp2.conversation_id = cp1.conversation_id
          AND cp2.user_id <> cp1.user_id

        INNER JOIN (
          SELECT conversation_id
          FROM conversation_participants
          GROUP BY conversation_id
          HAVING COUNT(*) = 2
        ) private_conversations
          ON private_conversations.conversation_id =
             cp1.conversation_id

        WHERE cp1.user_id = ?

        GROUP BY cp2.user_id
      ) user_conversations
        ON user_conversations.other_user_id = u.id

      LEFT JOIN conversations c
        ON c.id = user_conversations.conversation_id

      LEFT JOIN conversation_participants my_cp
        ON my_cp.conversation_id = c.id
        AND my_cp.user_id = ?

      WHERE u.id <> ?
        AND u.is_active = 1

      ORDER BY
        CASE WHEN c.id IS NULL THEN 1 ELSE 0 END,
        c.updated_at DESC,
        u.first_name ASC
      `,
      [
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
      ]
    );

    return res.status(200).json({
      success: true,
      contacts,
    });
  } catch (error) {
    return handleError(res, error, "Failed to load contacts.");
  }
}

// =============================================
// 2. OPEN OR CREATE PRIVATE CONVERSATION
// =============================================

async function openConversation(req, res) {
  let connection;

  try {
    const currentUserId = req.user.id;
    const otherUserId = validId(req.body.userId);

    if (!otherUserId || otherUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid contact.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [users] = await connection.execute(
      `
      SELECT id, first_name, last_name, role, profile_image
      FROM users
      WHERE id = ? AND is_active = 1
      LIMIT 1
      `,
      [otherUserId]
    );

    if (!users.length) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "This user is unavailable.",
      });
    }

    const [existing] = await connection.execute(
      `
      SELECT cp1.conversation_id
      FROM conversation_participants cp1
      INNER JOIN conversation_participants cp2
        ON cp2.conversation_id = cp1.conversation_id
      WHERE cp1.user_id = ?
        AND cp2.user_id = ?
        AND (
          SELECT COUNT(*)
          FROM conversation_participants cp3
          WHERE cp3.conversation_id = cp1.conversation_id
        ) = 2
      ORDER BY cp1.conversation_id DESC
      LIMIT 1
      `,
      [currentUserId, otherUserId]
    );

    let conversationId;

    if (existing.length) {
      conversationId = existing[0].conversation_id;
    } else {
      const [result] = await connection.execute(
        `INSERT INTO conversations () VALUES ()`
      );

      conversationId = result.insertId;

      await connection.execute(
        `
        INSERT INTO conversation_participants
          (conversation_id, user_id)
        VALUES (?, ?), (?, ?)
        `,
        [
          conversationId,
          currentUserId,
          conversationId,
          otherUserId,
        ]
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Conversation opened successfully.",
      conversationId,
      contact: users[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    return handleError(res, error, "Could not open the conversation.");
  } finally {
    if (connection) connection.release();
  }
}

// =============================================
// 3. GET CONVERSATION MESSAGES
// =============================================

async function getMessages(req, res) {
  try {
    const currentUserId = req.user.id;
    const conversationId = validId(req.params.conversationId);

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation.",
      });
    }

    const [membership] = await db.execute(
      `
      SELECT id
      FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
      LIMIT 1
      `,
      [conversationId, currentUserId]
    );

    if (!membership.length) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this conversation.",
      });
    }

    await db.execute(
      `
      UPDATE conversation_participants
      SET last_read_at = NOW()
      WHERE conversation_id = ? AND user_id = ?
      `,
      [conversationId, currentUserId]
    );

    // Mark this conversation's message notifications as read.
    await db.execute(
      `
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE user_id = ?
        AND notification_type = 'new_message'
        AND reference_id = ?
        AND is_read = 0
      `,
      [currentUserId, conversationId]
    );

    const [messages] = await db.execute(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_id,
        sender.first_name AS sender_first_name,
        sender.last_name AS sender_last_name,
        sender.profile_image AS sender_profile_image,
        m.message_type,

        CASE
          WHEN m.deleted_for_everyone_at IS NOT NULL
            THEN 'This message was deleted'
          ELSE m.message_text
        END AS message_text,

        CASE
          WHEN m.deleted_for_everyone_at IS NOT NULL
            THEN NULL
          ELSE m.attachment_name
        END AS attachment_name,

        CASE
          WHEN m.deleted_for_everyone_at IS NOT NULL
            THEN NULL
          ELSE m.attachment_mime
        END AS attachment_mime,

        CASE
          WHEN m.deleted_for_everyone_at IS NOT NULL
            THEN NULL
          ELSE m.attachment_size
        END AS attachment_size,

        m.edited_at,
        m.deleted_for_everyone_at,
        m.created_at,
        m.attachment_path,

        CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END AS is_mine

      FROM messages m
      INNER JOIN users sender ON sender.id = m.sender_id

      WHERE m.conversation_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM message_deletions md
          WHERE md.message_id = m.id
            AND md.user_id = ?
        )

      ORDER BY m.id DESC
      LIMIT 100
      `,
      [currentUserId, conversationId, currentUserId]
    );

    const formattedMessages = messages.reverse().map((message) => {
      const formatted = {
        ...message,
        attachment_url: attachmentUrl(
          message.id,
          message.deleted_for_everyone_at
        ),
      };

      delete formatted.attachment_path;
      return formatted;
    });

    const [countRows] = await db.execute(
      `
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
      `,
      [currentUserId]
    );

    emitToUser(currentUserId, "notification:count", {
      unreadCount: Number(countRows[0].unread_count),
    });

    const otherUsers = await getConversationUsers(conversationId);

    otherUsers
      .filter((id) => id !== currentUserId)
      .forEach((id) => {
        emitToUser(id, "message:read", {
          conversationId,
          readBy: currentUserId,
        });
      });

    return res.status(200).json({
      success: true,
      conversationId,
      messages: formattedMessages,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to load conversation messages."
    );
  }
}

// =============================================
// 4. SEND TEXT OR ATTACHMENT
// =============================================

async function sendMessage(req, res) {
  let uploadedFile = req.file;

  try {
    const currentUserId = req.user.id;
    const conversationId = validId(req.params.conversationId);

    const messageText = String(req.body.messageText || "").trim();

    if (!conversationId) {
      await removeUploadedFile(uploadedFile);

      return res.status(400).json({
        success: false,
        message: "Invalid conversation.",
      });
    }

    if (messageText.length > 5000) {
      await removeUploadedFile(uploadedFile);

      return res.status(400).json({
        success: false,
        message: "Messages cannot exceed 5000 characters.",
      });
    }

    if (!messageText && !uploadedFile) {
      return res.status(400).json({
        success: false,
        message: "Write a message or select an attachment.",
      });
    }

    const [membership] = await db.execute(
      `
      SELECT user_id
      FROM conversation_participants
      WHERE conversation_id = ?
      `,
      [conversationId]
    );

    if (
      membership.length !== 2 ||
      !membership.some((row) => row.user_id === currentUserId)
    ) {
      await removeUploadedFile(uploadedFile);

      return res.status(403).json({
        success: false,
        message: "You cannot send messages in this conversation.",
      });
    }

    const messageType = uploadedFile
      ? uploadedFile.messageCategory
      : "text";

    const attachmentPath = uploadedFile
      ? path.relative(BACKEND_ROOT, uploadedFile.path).split(path.sep).join("/")
      : null;

    const [result] = await db.execute(
      `
      INSERT INTO messages (
        conversation_id,
        sender_id,
        message_type,
        message_text,
        attachment_path,
        attachment_name,
        attachment_mime,
        attachment_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        conversationId,
        currentUserId,
        messageType,
        messageText || null,
        attachmentPath,
        uploadedFile ? uploadedFile.originalname : null,
        uploadedFile ? uploadedFile.mimetype : null,
        uploadedFile ? uploadedFile.size : null,
      ]
    );

    await db.execute(
      `UPDATE conversations SET updated_at = NOW() WHERE id = ?`,
      [conversationId]
    );

    const message = await getFormattedMessage(
      result.insertId,
      currentUserId
    );

    // Notify the other participant after the message is saved.
    const recipientIds = membership
      .map((row) => row.user_id)
      .filter((id) => id !== currentUserId);

    recipientIds.forEach((recipientId) => {
      emitToUser(recipientId, "message:new", {
        conversationId,
        message,
      });
    });

    for (const recipientId of recipientIds) {
      try {
        await createNotification({
          userId: recipientId,
          type: "new_message",
          title: `New message from ${req.user.first_name}`,
          message: messageText || `Sent an ${messageType} attachment.`,
          referenceId: conversationId,
        });
      } catch (notificationError) {
        console.error(
          "Message notification error:",
          notificationError.message
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: message,
    });
  } catch (error) {
    await removeUploadedFile(uploadedFile);
    return handleError(res, error, "Failed to send message.");
  }
}

// =============================================
// 5. EDIT YOUR OWN TEXT MESSAGE
// =============================================

async function editMessage(req, res) {
  try {
    const currentUserId = req.user.id;
    const messageId = validId(req.params.messageId);
    const messageText = String(req.body.messageText || "").trim();

    if (!messageId || !messageText || messageText.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid message.",
      });
    }

    const [result] = await db.execute(
      `
      UPDATE messages
      SET message_text = ?, edited_at = NOW()
      WHERE id = ?
        AND sender_id = ?
        AND message_type = 'text'
        AND deleted_for_everyone_at IS NULL
      `,
      [messageText, messageId, currentUserId]
    );

    if (!result.affectedRows) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own active text messages.",
      });
    }

    const message = await getFormattedMessage(
      messageId,
      currentUserId
    );

    await emitToConversation(
      message.conversation_id,
      "message:updated",
      { message }
    );

    return res.status(200).json({
      success: true,
      message: "Message edited successfully.",
      data: message,
    });
  } catch (error) {
    return handleError(res, error, "Failed to edit message.");
  }
}

// =============================================
// 6. DELETE YOUR OWN MESSAGE FOR EVERYONE
// =============================================

async function deleteForEveryone(req, res) {
  try {
    const currentUserId = req.user.id;
    const messageId = validId(req.params.messageId);

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Invalid message.",
      });
    }

    const [result] = await db.execute(
      `
      UPDATE messages
      SET deleted_for_everyone_at = NOW()
      WHERE id = ?
        AND sender_id = ?
        AND deleted_for_everyone_at IS NULL
      `,
      [messageId, currentUserId]
    );

    if (!result.affectedRows) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own active messages for everyone.",
      });
    }

    const message = await getFormattedMessage(
      messageId,
      currentUserId
    );

    await emitToConversation(
      message.conversation_id,
      "message:deleted",
      { messageId, conversationId: message.conversation_id }
    );

    return res.status(200).json({
      success: true,
      message: "Message deleted for everyone.",
      messageId,
    });
  } catch (error) {
    return handleError(res, error, "Failed to delete message.");
  }
}

// =============================================
// 7. DELETE MESSAGE ONLY FOR CURRENT USER
// =============================================

async function deleteForMe(req, res) {
  try {
    const currentUserId = req.user.id;
    const messageId = validId(req.params.messageId);

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Invalid message.",
      });
    }

    const [messages] = await db.execute(
      `
      SELECT m.id
      FROM messages m
      INNER JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = ? AND cp.user_id = ?
      LIMIT 1
      `,
      [messageId, currentUserId]
    );

    if (!messages.length) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    await db.execute(
      `
      INSERT IGNORE INTO message_deletions (message_id, user_id)
      VALUES (?, ?)
      `,
      [messageId, currentUserId]
    );

    return res.status(200).json({
      success: true,
      message: "Message hidden from your conversation.",
      messageId,
    });
  } catch (error) {
    return handleError(res, error, "Failed to hide message.");
  }
}

// =============================================
// 8. SECURE ATTACHMENT ACCESS
// =============================================

async function downloadAttachment(req, res) {
  try {
    const currentUserId = req.user.id;
    const messageId = validId(req.params.messageId);

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Invalid message.",
      });
    }

    const [rows] = await db.execute(
      `
      SELECT
        m.attachment_path,
        m.attachment_name,
        m.attachment_mime
      FROM messages m
      INNER JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = ?
        AND cp.user_id = ?
        AND m.deleted_for_everyone_at IS NULL
        AND m.attachment_path IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM message_deletions md
          WHERE md.message_id = m.id
            AND md.user_id = ?
        )
      LIMIT 1
      `,
      [messageId, currentUserId, currentUserId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found or you cannot access it.",
      });
    }

    const storedPath = path.resolve(BACKEND_ROOT, rows[0].attachment_path);
    const allowedRoot = path.resolve(MESSAGE_UPLOAD_ROOT) + path.sep;

    if (!storedPath.startsWith(allowedRoot)) {
      return res.status(403).json({
        success: false,
        message: "Invalid attachment location.",
      });
    }

    if (!fs.existsSync(storedPath)) {
      return res.status(404).json({
        success: false,
        message: "Attachment file is missing.",
      });
    }

    const safeName = encodeURIComponent(
      rows[0].attachment_name || "attachment"
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${safeName}`
    );
    res.setHeader("Content-Type", rows[0].attachment_mime);
    res.setHeader("Cache-Control", "private, no-store");

    return res.sendFile(storedPath);
  } catch (error) {
    return handleError(res, error, "Failed to load attachment.");
  }
}

// =============================================
// EXPORT
// =============================================

module.exports = {
  getContacts,
  openConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteForEveryone,
  deleteForMe,
  downloadAttachment,
};
