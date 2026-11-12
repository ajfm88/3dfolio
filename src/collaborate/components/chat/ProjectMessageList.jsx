import { useRef } from "react";

import { requestEarlier, useProjectChatScroll } from "../../hooks/useProjectChatScroll.js";
import { useProjectChatStore } from "../../store/useProjectChatStore.js";
import ProjectMessageBubble from "./ProjectMessageBubble.jsx";

const buttonClass =
  "rounded-full border border-[var(--collab-border)] px-3 py-1 text-xs font-semibold text-[var(--collab-accent-2)] hover:bg-[var(--collab-elevated)] disabled:opacity-40";

const ProjectMessageList = () => {
  const messages = useProjectChatStore((state) => state.messages);
  const historyStatus = useProjectChatStore((state) => state.historyStatus);
  const historyError = useProjectChatStore((state) => state.historyError);
  const earlierStatus = useProjectChatStore((state) => state.earlierStatus);
  const earlierError = useProjectChatStore((state) => state.earlierError);
  const hasMore = useProjectChatStore((state) => state.hasMore);
  const ownSendTick = useProjectChatStore((state) => state.ownSendTick);
  const loadEarlier = useProjectChatStore((state) => state.loadEarlier);
  const retryInitial = useProjectChatStore((state) => state.retryInitial);
  const retryEarlier = useProjectChatStore((state) => state.retryEarlier);
  const holdRef = useRef(null);
  const listRef = useProjectChatScroll({
    messages,
    historyStatus,
    earlierStatus,
    ownSendTick,
    holdRef,
  });

  const onEarlier = () => requestEarlier(listRef.current, holdRef, loadEarlier);
  const onRetryEarlier = () => requestEarlier(listRef.current, holdRef, retryEarlier);

  return (
    <div
      ref={listRef}
      role="region"
      aria-label="Messages"
      tabIndex={0}
      className="project-chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div data-project-chat-content="">
      {historyStatus === "loading" || historyStatus === "idle" ? (
        <div role="status" className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-[var(--collab-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--collab-border-strong)] border-t-[var(--collab-accent-2)]" />
          Loading messages
        </div>
      ) : null}
      {historyStatus === "error" ? (
        <div role="alert" className="px-4 py-4 text-center">
          <p className="text-sm text-[var(--collab-text)]">Couldn&apos;t load messages</p>
          {historyError && historyError !== "Couldn't load messages" ? (
            <p className="mt-1 text-xs text-[var(--collab-muted)]">{historyError}</p>
          ) : null}
          <button type="button" className={`${buttonClass} mt-3`} onClick={() => retryInitial()}>
            Retry
          </button>
        </div>
      ) : null}
      {historyStatus === "ready" && hasMore ? (
        <div className="flex justify-center px-3 py-2">
          {earlierStatus === "error" ? (
            <div className="text-center">
              <p className="text-xs text-[var(--collab-muted)]">Couldn&apos;t load earlier messages</p>
              {earlierError && earlierError !== "Couldn't load earlier messages" ? (
                <p className="mt-1 text-xs text-[var(--collab-faint)]">{earlierError}</p>
              ) : null}
              <button type="button" className={`${buttonClass} mt-2`} onClick={onRetryEarlier}>
                Retry
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={buttonClass}
              onClick={onEarlier}
              disabled={earlierStatus === "loading"}
            >
              {earlierStatus === "loading" ? "Loading earlier" : "Load earlier"}
            </button>
          )}
        </div>
      ) : null}
      {historyStatus === "ready" && messages.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-[var(--collab-muted)]">No messages yet. Say hello!</p>
      ) : null}
      <ol aria-label="Message history" className="flex flex-col py-2">
        {messages.map((message) => (
          <ProjectMessageBubble key={message._id} message={message} />
        ))}
      </ol>
      </div>
    </div>
  );
};

export default ProjectMessageList;
