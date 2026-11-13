
function formatTime(date) {
  if (!date) return "";

  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({
  message,
  isMine,
  attachmentUrl,
  onEdit,
  onDelete,
}) {
  // Never render a message deleted for everyone.
  if (message.deleted_for_everyone_at) {
    return null;
  }

  // Ignore temporary attachment placeholder messages.
  const messageText = String(message.message_text || "").trim();

  if (
    messageText.toLowerCase() === "this message was deleted" ||
    messageText.toLowerCase() === "this message was deleted." ||
    (
      messageText.toLowerCase() === "loading attachment..." &&
      !message.attachment_url
    )
  ) {
    return null;
  }

  function renderAttachment() {
    // Do not show a loading placeholder.
    if (!attachmentUrl) {
      return null;
    }

    switch (message.message_type) {
      case "image":
        return (
          <a
            href={attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={attachmentUrl}
              alt={message.attachment_name || "Image"}
              className="fm-chat-image"
            />
          </a>
        );

      case "audio":
        return (
          <audio
            controls
            src={attachmentUrl}
            className="fm-chat-audio"
          />
        );

      case "video":
        return (
          <video
            controls
            src={attachmentUrl}
            className="fm-chat-video"
          />
        );

      default:
        return null;
    }
  }

  return (
    <div
      className={`fm-message-row ${
        isMine ? "fm-message-mine" : "fm-message-theirs"
      }`}
    >
      <div className="fm-message-bubble">

        {messageText && (
          <p>{messageText}</p>
        )}

        {message.attachment_url && renderAttachment()}

        <div className="fm-message-meta">
          <small>{formatTime(message.created_at)}</small>

          {message.edited_at && (
            <small>Edited</small>
          )}
        </div>

        <div className="fm-message-actions">
          {isMine && message.message_type === "text" && (
            <button
              type="button"
              title="Edit message"
              onClick={() => onEdit(message)}
            >
              <i className="bi bi-pencil" />
            </button>
          )}

          <button
            type="button"
            title="Delete message"
            onClick={() => onDelete(message)}
          >
            <i className="bi bi-trash" />
          </button>
        </div>

      </div>
    </div>
  );
}

export default MessageBubble;
