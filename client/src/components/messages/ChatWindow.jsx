
import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";

function ChatWindow({
  messages = [],
  currentUserId,
  attachmentUrls = {},
  onEditMessage,
  onDeleteMessage,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className="fm-chat-messages">
      {messages.length === 0 ? (
        <div className="fm-no-messages">
          No messages yet. Start the conversation!
        </div>
      ) : (
        messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={
              Number(message.sender_id) === Number(currentUserId)
            }
            attachmentUrl={attachmentUrls[message.id]}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
          />
        ))
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export default ChatWindow;
