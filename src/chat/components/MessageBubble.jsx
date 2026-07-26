import { useState } from "react";

import { formatMessageTime } from "../lib/utils";

const MediaImage = ({ src, alt }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="max-h-64 w-full cursor-pointer rounded-lg object-cover"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
};

const MessageBubble = ({ message, isOwn }) => {
  const hasMedia = message.image || message.video;

  return (
    <div className={`flex w-full ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(90%,28rem)] overflow-hidden rounded-2xl text-[15px] leading-snug sm:max-w-[min(75%,28rem)] ${
          hasMedia ? "p-1" : "px-3 py-2 sm:px-3.5"
        } ${
          isOwn
            ? "rounded-br-md bg-[var(--chat-accent)] text-white"
            : "rounded-bl-md bg-[var(--chat-elevated)]"
        }`}
      >
        {message.image && (
          <MediaImage src={message.image} alt="Shared image" />
        )}

        {message.video && (
          <video
            src={message.video}
            controls
            preload="metadata"
            className="max-h-64 w-full rounded-lg"
          />
        )}

        {message.text && (
          <p className={`whitespace-pre-wrap break-words ${hasMedia ? "px-2.5 pt-1.5" : ""}`}>
            {message.text}
          </p>
        )}

        <p
          className={`text-[11px] tabular-nums ${hasMedia ? "px-2.5 pb-1.5 pt-0.5" : "mt-1"} ${
            isOwn ? "text-white/60" : "text-[var(--chat-faint)]"
          }`}
        >
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
};

export default MessageBubble;
