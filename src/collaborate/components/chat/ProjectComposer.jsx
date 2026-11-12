import { useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";

import { PROJECT_CHAT_TEXT_MAX, composerKeyDecision, messageHasContent } from "../../lib/projectChat.js";
import { selectCanChat, useWorkspaceStore } from "../../store/useWorkspaceStore.js";
import { useProjectChatStore } from "../../store/useProjectChatStore.js";

const ProjectComposer = () => {
  const text = useProjectChatStore((state) => state.composerText);
  const attachment = useProjectChatStore((state) => state.attachment);
  const isSending = useProjectChatStore((state) => state.isSending);
  const historyStatus = useProjectChatStore((state) => state.historyStatus);
  const setComposerText = useProjectChatStore((state) => state.setComposerText);
  const setAttachment = useProjectChatStore((state) => state.setAttachment);
  const stopTyping = useProjectChatStore((state) => state.stopTyping);
  const sendMessage = useProjectChatStore((state) => state.sendMessage);
  const canChat = useWorkspaceStore(selectCanChat);
  const [previewUrl, setPreviewUrl] = useState(null);
  const nearLimit = text.length >= 1800;
  const canSend = canChat && historyStatus === "ready" && !isSending && messageHasContent(text, attachment);

  useEffect(() => {
    if (!attachment || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const onKeyDown = (event) => {
    const decision = composerKeyDecision({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent?.isComposing || event.isComposing,
      keyCode: event.nativeEvent?.keyCode ?? event.keyCode,
    });
    if (!decision.send) return;
    event.preventDefault();
    if (canSend) sendMessage();
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setAttachment(file);
  };

  return (
    <form
      className="shrink-0 border-t border-[var(--collab-border)] px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) sendMessage();
      }}
    >
      {attachment ? (
        <div className="mb-2 flex items-center gap-2">
          {previewUrl && attachment.type?.startsWith("video/") ? (
            <video src={previewUrl} muted preload="metadata" className="h-16 max-w-[8rem] rounded-lg border border-[var(--collab-border)] object-cover" />
          ) : null}
          {previewUrl && !attachment.type?.startsWith("video/") ? (
            <img src={previewUrl} alt="Attachment preview" className="h-16 max-w-[8rem] rounded-lg border border-[var(--collab-border)] object-cover" />
          ) : null}
          <button
            type="button"
            className="text-xs text-[var(--collab-muted)] underline disabled:opacity-40"
            onClick={() => setAttachment(null)}
            disabled={isSending}
          >
            Remove attachment
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <label className="mb-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-[var(--collab-faint)] hover:text-[var(--collab-accent-2)]">
          <span className="sr-only">Attach image or video</span>
          <ImagePlus className="h-5 w-5" aria-hidden="true" />
          <input
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            disabled={isSending}
            onChange={onFile}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Message</span>
          <textarea
            rows={1}
            maxLength={PROJECT_CHAT_TEXT_MAX}
            value={text}
            disabled={isSending}
            placeholder="Message the project"
            aria-describedby={nearLimit ? "project-chat-length" : undefined}
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => stopTyping()}
            className="max-h-32 min-h-[2.5rem] w-full resize-none rounded-xl border border-[var(--collab-border)] bg-[var(--collab-elevated)] px-3 py-2 text-base text-[var(--collab-text)] outline-none focus-visible:border-[var(--collab-border-strong)] disabled:opacity-40"
          />
        </label>
        <button
          type="submit"
          className="mb-1 shrink-0 rounded-xl bg-[var(--collab-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          disabled={!canSend}
        >
          {isSending ? "Sending" : "Send"}
        </button>
      </div>
      {nearLimit ? (
        <p id="project-chat-length" className="mt-1 text-right text-[11px] text-[var(--collab-faint)]">
          {text.length}/{PROJECT_CHAT_TEXT_MAX}
        </p>
      ) : null}
    </form>
  );
};

export default ProjectComposer;
