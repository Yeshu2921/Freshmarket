
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
  const deleted = Boolean(message.deleted_for_everyone_at);

  function renderAttachment() {
    if (!attachmentUrl) {
      return <small>Loading attachment...</small>;
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
        {deleted ? (
          <i>This message was deleted.</i>
        ) : (
          <>
            {message.message_text && (
              <p>{message.message_text}</p>
            )}

            {message.attachment_url && renderAttachment()}
          </>
        )}

        <div className="fm-message-meta">
          <small>{formatTime(message.created_at)}</small>

          {message.edited_at && !deleted && (
            <small>Edited</small>
          )}
        </div>

        {!deleted && (
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
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
