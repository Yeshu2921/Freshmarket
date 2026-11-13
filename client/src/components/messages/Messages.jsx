
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getContacts,
  openConversation,
  getMessages,
  sendMessage,
  editMessage,
  deleteForEveryone,
  deleteForMe,
  loadAttachment,
} from "../../services/messageService";

import { connectSocket } from "../../services/socket";

import ContactList from "./ContactList";
import ChatWindow from "./ChatWindow";
import MessageComposer from "./MessageComposer";

import "./Messages.css";

// =============================================
// API CONFIGURATION
// =============================================

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

// =============================================
// HELPERS
// =============================================

function getInitials(firstName, lastName) {
  return (
    `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?"
  );
}

function getProfileImage(imagePath) {
  if (!imagePath) return null;

  const image = String(imagePath).trim();

  if (/^(https?:\/\/|data:|blob:)/i.test(image)) {
    return image;
  }

  return `${API_ORIGIN}/${image.replace(/^\/+/, "")}`;
}

// Only these message types can contain attachments.
function hasAttachment(message) {
  return (
    ["image", "audio", "video"].includes(message.message_type) &&
    Boolean(message.attachment_url) &&
    !message.deleted_for_everyone_at
  );
}

// Remove deleted and unfinished placeholder messages.
function cleanMessages(messages) {
  return (messages || []).filter((message) => {
    if (message.deleted_for_everyone_at) {
      return false;
    }

    const text = String(message.message_text || "")
      .trim()
      .toLowerCase();

    if (
      text === "this message was deleted" ||
      text === "this message was deleted."
    ) {
      return false;
    }

    if (
      text === "loading attachment..." &&
      !hasAttachment(message)
    ) {
      return false;
    }

    return true;
  });
}

// =============================================
// MESSAGES COMPONENT
// =============================================

function Messages({ currentUser }) {
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);

  const [attachmentUrls, setAttachmentUrls] = useState({});

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const attachmentUrlsRef = useRef({});
  const conversationIdRef = useRef(null);

  const currentUserId = Number(currentUser?.id);

  // ------------------------------------------
  // LOAD CONTACTS
  // ------------------------------------------

  const loadContacts = useCallback(async () => {
    try {
      const result = await getContacts();

      const updatedContacts = result.contacts || [];

      setContacts(updatedContacts);

      return updatedContacts;
    } catch (err) {
      console.error("Load contacts error:", err);

      setError(err.message || "Unable to load contacts.");

      throw err;
    }
  }, []);

  // ------------------------------------------
  // INITIALIZE
  // ------------------------------------------

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        await loadContacts();
      } catch (err) {
        console.error("Messages initialization error:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [loadContacts]);

  // ------------------------------------------
  // LOAD CONVERSATION MESSAGES
  // ------------------------------------------

  const loadConversationMessages = useCallback(
    async (id) => {
      if (!id) return [];

      try {
        const result = await getMessages(id);

        const clean = cleanMessages(result.messages);

        setMessages(clean);

        // Refresh unread counts.
        await loadContacts();

        return clean;
      } catch (err) {
        console.error("Load messages error:", err);

        setError(err.message || "Unable to load messages.");

        return [];
      }
    },
    [loadContacts]
  );

  // ------------------------------------------
  // SELECT CONTACT
  // ------------------------------------------

  const handleSelectContact = async (contact) => {
    setError("");

    setSelectedContact(contact);
    setMessages([]);
    setConversationId(null);

    conversationIdRef.current = null;

    try {
      const result = await openConversation(contact.id);

      const id =
        result.conversationId ||
        result.conversation?.id ||
        result.id;

      if (!id) {
        throw new Error(
          "Conversation ID was not returned by the server."
        );
      }

      conversationIdRef.current = id;

      setConversationId(id);

      await loadConversationMessages(id);
    } catch (err) {
      console.error("Open conversation error:", err);

      setError(err.message || "Unable to open conversation.");
    }
  };

  // ------------------------------------------
  // SOCKET.IO REAL-TIME EVENTS
  // ------------------------------------------

  useEffect(() => {
    const socket = connectSocket();

    if (!socket) return;

    const handleNewMessage = (data) => {
      const activeConversation = conversationIdRef.current;

      if (
        activeConversation &&
        String(data.conversationId) === String(activeConversation)
      ) {
        loadConversationMessages(activeConversation);
      }

      loadContacts();
    };

    const handleUpdatedMessage = (data) => {
      const activeConversation = conversationIdRef.current;

      if (
        activeConversation &&
        String(data.conversationId) === String(activeConversation)
      ) {
        loadConversationMessages(activeConversation);
      }
    };

    const handleDeletedMessage = (data) => {
      const activeConversation = conversationIdRef.current;

      if (
        activeConversation &&
        String(data.conversationId) === String(activeConversation)
      ) {
        loadConversationMessages(activeConversation);
      }

      loadContacts();
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:updated", handleUpdatedMessage);
    socket.on("message:deleted", handleDeletedMessage);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:updated", handleUpdatedMessage);
      socket.off("message:deleted", handleDeletedMessage);
    };
  }, [loadContacts, loadConversationMessages]);

  // ------------------------------------------
  // LOAD PRIVATE ATTACHMENTS
  // ------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadFiles() {
      // Only real image, audio, and video messages
      // are allowed to request an attachment.
      const validMessageIds = new Set(
        messages
          .filter(hasAttachment)
          .map((message) => String(message.id))
      );

      // Remove URLs for messages no longer displayed.
      Object.entries(attachmentUrlsRef.current).forEach(
        ([messageId, url]) => {
          if (!validMessageIds.has(messageId)) {
            URL.revokeObjectURL(url);

            delete attachmentUrlsRef.current[messageId];
          }
        }
      );

      setAttachmentUrls((previous) => {
        const updated = {};

        Object.entries(previous).forEach(([messageId, url]) => {
          if (validMessageIds.has(messageId)) {
            updated[messageId] = url;
          }
        });

        return updated;
      });

      // Download only valid attachments.
      for (const message of messages) {
        const messageId = String(message.id);

        if (
          !hasAttachment(message) ||
          attachmentUrlsRef.current[messageId]
        ) {
          continue;
        }

        try {
          const url = await loadAttachment(message.id);

          if (!active) {
            URL.revokeObjectURL(url);
            continue;
          }

          // Prevent duplicate URL creation.
          if (attachmentUrlsRef.current[messageId]) {
            URL.revokeObjectURL(url);
            continue;
          }

          attachmentUrlsRef.current[messageId] = url;

          setAttachmentUrls((previous) => ({
            ...previous,
            [messageId]: url,
          }));
        } catch (err) {
          console.error(
            `Attachment loading error (${messageId}):`,
            err
          );
        }
      }
    }

    loadFiles();

    return () => {
      active = false;
    };
  }, [messages]);

  // ------------------------------------------
  // CLEAN UP PRIVATE ATTACHMENTS
  // ------------------------------------------

  useEffect(() => {
    return () => {
      Object.values(attachmentUrlsRef.current).forEach(
        (url) => URL.revokeObjectURL(url)
      );

      attachmentUrlsRef.current = {};
    };
  }, []);

  // ------------------------------------------
  // SEND MESSAGE
  // ------------------------------------------

  const handleSendMessage = async (text, file) => {
    if (!conversationId || sending) return false;

    if (!text.trim() && !file) return false;

    setSending(true);
    setError("");

    try {
      await sendMessage(conversationId, text, file);

      await loadConversationMessages(conversationId);

      await loadContacts();

      return true;
    } catch (err) {
      console.error("Send message error:", err);

      setError(
        err.message || "Unable to send message. Please try again."
      );

      return false;
    } finally {
      setSending(false);
    }
  };

  // ------------------------------------------
  // EDIT MESSAGE
  // ------------------------------------------

  const handleEditMessage = async (message) => {
    const newText = window.prompt(
      "Edit your message:",
      message.message_text || ""
    );

    if (newText === null) return;

    if (!newText.trim()) {
      setError("Message cannot be empty.");
      return;
    }

    try {
      await editMessage(message.id, newText.trim());

      await loadConversationMessages(conversationId);
    } catch (err) {
      console.error("Edit message error:", err);

      setError(err.message || "Unable to edit message.");
    }
  };

  // ------------------------------------------
  // DELETE MESSAGE
  // ------------------------------------------

  const handleDeleteMessage = async (message) => {
    const isMine =
      Number(message.sender_id) === currentUserId;

    const deleteAll = isMine
      ? window.confirm(
          "Delete this message for everyone? Choose Cancel to hide it only for yourself."
        )
      : false;

    try {
      if (deleteAll) {
        await deleteForEveryone(message.id);
      } else {
        await deleteForMe(message.id);
      }

      await loadConversationMessages(conversationId);

      await loadContacts();
    } catch (err) {
      console.error("Delete message error:", err);

      setError(err.message || "Unable to delete message.");
    }
  };

  // ------------------------------------------
  // LOADING SCREEN
  // ------------------------------------------

  if (loading) {
    return (
      <div className="fm-messages-loading">
        Loading messages...
      </div>
    );
  }

  // ------------------------------------------
  // MAIN RENDER
  // ------------------------------------------

  return (
    <div className="fm-messages-page">

      <div className="fm-messages-heading">
        <div>
          <h3>Messages</h3>
          <p>Communicate with your FreshMart team.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          {error}

          <button
            type="button"
            className="btn-close float-end"
            onClick={() => setError("")}
          />
        </div>
      )}

      <div className="fm-messages-layout">

        {/* LEFT: CHAT WINDOW */}

        <section className="fm-chat-section">

          {!selectedContact ? (
            <div className="fm-chat-empty">
              <i className="bi bi-chat-dots" />

              <h5>Select a contact</h5>

              <p>
                Choose an Owner or Worker from the contact list.
              </p>
            </div>
          ) : (
            <>
              <div className="fm-chat-header">

                <div className="fm-contact-avatar">

                  {selectedContact.profile_image ? (
                    <img
                      src={getProfileImage(
                        selectedContact.profile_image
                      )}
                      alt={`${selectedContact.first_name} ${selectedContact.last_name}`}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    getInitials(
                      selectedContact.first_name,
                      selectedContact.last_name
                    )
                  )}

                </div>

                <div>
                  <strong>
                    {selectedContact.first_name}{" "}
                    {selectedContact.last_name}
                  </strong>

                  <small>{selectedContact.role}</small>
                </div>

              </div>

              <ChatWindow
                messages={messages}
                currentUserId={currentUserId}
                attachmentUrls={attachmentUrls}
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
              />

              <MessageComposer
                onSend={handleSendMessage}
                sending={sending}
                disabled={!conversationId}
              />
            </>
          )}

        </section>

        {/* RIGHT: CONTACT LIST */}

        <aside className="fm-contacts-section">

          <div className="fm-contacts-heading">
            <h5>Contacts</h5>

            <span>{contacts.length}</span>
          </div>

          <ContactList
            contacts={contacts}
            selectedContact={selectedContact}
            onSelectContact={handleSelectContact}
          />

        </aside>

      </div>
    </div>
  );
}

export default Messages;
