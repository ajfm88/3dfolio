import { useState } from "react";
import { format } from "timeago.js";

import { displaySender, initials, isSafeMediaUrl } from "../../lib/projectChat.js";
import { useSessionStore } from "../../store/useSessionStore.js";
import { canonicalUserId } from "../../lib/cursorPresence.js";

const ProjectMessageBubble = ({ message }) => {
  const selfId = useSessionStore((state) => canonicalUserId(state.authUser?._id));
  const sender = displaySender(message, selfId);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const stamp = message.createdAt;

  return (
    <li data-message-id={message._id} className="flex gap-2 px-3 py-1.5">
      {sender.own ? (
        <span className="mt-1 w-7 shrink-0" aria-hidden="true" />
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--collab-elevated)] text-[10px] font-semibold text-[var(--collab-text)]">
          {sender.img ? (
            <img src={sender.img} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(sender.name)
          )}
        </span>
      )}
      <div className={`min-w-0 flex-1 ${sender.own ? "text-right" : ""}`}>
        <div className={`flex items-baseline gap-2 ${sender.own ? "justify-end" : ""}`}>
          <span className="truncate text-xs font-semibold text-[var(--collab-text)]">{sender.name}</span>
          <time
            dateTime={stamp}
            aria-label={stamp}
            className="shrink-0 text-[11px] text-[var(--collab-faint)]"
          >
            {format(stamp)}
          </time>
        </div>
        {message.text ? (
          <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--collab-text)] ${sender.own ? "text-right" : "text-left"}`}>
            {message.text}
          </p>
        ) : null}
        {message.image && isSafeMediaUrl(message.image) ? (
          <div className={`mt-1 ${sender.own ? "ml-auto" : ""} max-w-full`}>
            {imageFailed ? null : (
              <img
                src={message.image}
                alt={message.text || `Image from ${sender.name}`}
                loading="lazy"
                className="max-h-40 max-w-full rounded-lg border border-[var(--collab-border)] object-contain"
                onError={() => setImageFailed(true)}
              />
            )}
            <a
              href={message.image}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-[var(--collab-accent-2)] underline"
            >
              Open image
            </a>
          </div>
        ) : null}
        {message.video && isSafeMediaUrl(message.video) ? (
          <div className={`mt-1 ${sender.own ? "ml-auto" : ""} max-w-full`}>
            {videoFailed ? null : (
              <video
                src={message.video}
                controls
                preload="metadata"
                className="max-h-40 max-w-full rounded-lg border border-[var(--collab-border)]"
                onError={() => setVideoFailed(true)}
              />
            )}
            <a
              href={message.video}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-[var(--collab-accent-2)] underline"
            >
              Open video
            </a>
          </div>
        ) : null}
      </div>
    </li>
  );
};

export default ProjectMessageBubble;
