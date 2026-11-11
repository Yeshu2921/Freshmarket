
import { useRef, useState } from "react";

function MessageComposer({
  onSend,
  sending = false,
  disabled = false,
}) {
  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const acceptedTypes = {
    image: "image/jpeg,image/png,image/webp,image/gif",
    audio:
      "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/webm",
    video: "video/mp4,video/webm,video/quicktime",
  };

  function chooseAttachment(type) {
    if (!fileInputRef.current) return;

    fileInputRef.current.accept = acceptedTypes[type];
    fileInputRef.current.click();
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (file) {
      setSelectedFile(file);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (sending || disabled) return;

    if (!messageText.trim() && !selectedFile) return;

    const success = await onSend(
      messageText,
      selectedFile
    );

    if (success !== false) {
      setMessageText("");
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeAttachment() {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <form
      className="fm-message-composer"
      onSubmit={handleSubmit}
    >
      <div className="fm-attachment-buttons">
        <button
          type="button"
          title="Send image"
          disabled={disabled || sending}
          onClick={() => chooseAttachment("image")}
        >
          <i className="bi bi-image" />
        </button>

        <button
          type="button"
          title="Send audio"
          disabled={disabled || sending}
          onClick={() => chooseAttachment("audio")}
        >
          <i className="bi bi-mic" />
        </button>

        <button
          type="button"
          title="Send video"
          disabled={disabled || sending}
          onClick={() => chooseAttachment("video")}
        >
          <i className="bi bi-camera-video" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileChange}
        />
      </div>

      <div className="fm-composer-input">
        {selectedFile && (
          <div className="fm-selected-file">
            <span title={selectedFile.name}>
              {selectedFile.name}
            </span>

            <button
              type="button"
              title="Remove attachment"
              onClick={removeAttachment}
            >
              <i className="bi bi-x-circle" />
            </button>
          </div>
        )}

        <input
          type="text"
          value={messageText}
          onChange={(event) =>
            setMessageText(event.target.value)
          }
          placeholder="Type a message..."
          maxLength={5000}
          disabled={disabled || sending}
        />
      </div>

      <button
        type="submit"
        className="fm-send-button"
        disabled={
          disabled ||
          sending ||
          (!messageText.trim() && !selectedFile)
        }
        title="Send message"
      >
        {sending ? (
          <span className="spinner-border spinner-border-sm" />
        ) : (
          <i className="bi bi-send-fill" />
        )}
      </button>
    </form>
  );
}

export default MessageComposer;
