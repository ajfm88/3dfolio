import { formatMessageTime } from "../lib/utils";

const MessageBubble = ({ message, isOwn }) => (
  <div className={`flex w-full ${isOwn ? "justify-end" : "justify-start"}`}>
    <div
      className={`max-w-[min(90%,28rem)] rounded-2xl px-3 py-2 text-[15px] leading-snug sm:max-w-[min(75%,28rem)] sm:px-3.5 ${
        isOwn
          ? "rounded-br-md bg-[var(--chat-accent)] text-white"
          : "rounded-bl-md bg-[var(--chat-elevated)]"
      }`}
    >
      {message.text && (
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
      )}
      <p
        className={`mt-1 text-[11px] tabular-nums ${
          isOwn ? "text-white/60" : "text-[var(--chat-faint)]"
        }`}
      >
        {formatMessageTime(message.createdAt)}
      </p>
    </div>
  </div>
);

export default MessageBubble;
