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

  const messageText = String(message.message_text || "").trim();

  const normalizedText = messageText.toLowerCase();

  // Hide old deleted-message placeholders.
  if (
    normalizedText === "this message was deleted" ||
    normalizedText === "this message was deleted."
  ) {
    return null;
  }

  // Hide old unfinished attachment placeholders.
  if (
    normalizedText === "loading attachment..." &&
    !message.attachment_url
  ) {
    return null;
  }

  const hasAttachment =
    ["image", "audio", "video"].includes(message.message_type) &&
    Boolean(message.attachment_url);

  function renderAttachment() {
    if (!hasAttachment || !attachmentUrl) {
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

        {hasAttachment && renderAttachment()}

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
