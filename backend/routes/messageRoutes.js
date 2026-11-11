
const express = require("express");

const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");

const {
  uploadMessageAttachment,
  validateMessageAttachmentSize,
} = require("../middleware/messageUpload");

const {
  getContacts,
  openConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteForEveryone,
  deleteForMe,
  downloadAttachment,
} = require("../controllers/messageController");

// All message routes require authentication.
router.use(requireAuth);

// Contacts and conversations.
router.get("/contacts", getContacts);
router.post("/conversations/open", openConversation);

// Read messages.
router.get(
  "/conversations/:conversationId/messages",
  getMessages
);

// Send text, image, audio, or video.
router.post(
  "/conversations/:conversationId/messages",
  uploadMessageAttachment.single("attachment"),
  validateMessageAttachmentSize,
  sendMessage
);

// Edit your own text message.
router.patch("/messages/:messageId", editMessage);

// Delete your own message for everyone.
router.delete(
  "/messages/:messageId/everyone",
  deleteForEveryone
);

// Hide a message only from your own account.
router.delete(
  "/messages/:messageId/me",
  deleteForMe
);

// Secure attachment viewing/downloading.
router.get(
  "/messages/:messageId/attachment",
  downloadAttachment
);

module.exports = router;
