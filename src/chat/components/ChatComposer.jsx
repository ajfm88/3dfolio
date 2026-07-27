import { useRef, useState } from "react";
import { ImagePlus, Loader, SendHorizontal, X } from "lucide-react";

import { useChatStore } from "../store/useChatStore";
import useKeyboardSound from "../hooks/useKeyboardSound";

const ACCEPT = "image/*,video/*";

// Held-down keys and bare modifiers would otherwise machine-gun the click.
const SILENT_KEYS = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"];

const ChatComposer = ({ activeConversationId }) => {
  const composerText = useChatStore((s) => s.composerText);
  const setComposerText = useChatStore((s) => s.setComposerText);
  const sendTextMessage = useChatStore((s) => s.sendTextMessage);
  const sendMediaMessage = useChatStore((s) => s.sendMediaMessage);
  const isSendingMedia = useChatStore((s) => s.isSendingMedia);
  const isSoundEnabled = useChatStore((s) => s.isSoundEnabled);
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);

  const canSend = composerText.trim().length > 0 || mediaFile;

  const handleSend = async () => {
    if (!canSend || isSendingMedia) return;

    if (mediaFile) {
      await sendMediaMessage({ conversationId: activeConversationId, file: mediaFile });
      clearMedia();
    } else {
      await sendTextMessage(activeConversationId);
    }

    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (isSoundEnabled && !e.repeat && !SILENT_KEYS.includes(e.key)) {
      playRandomKeyStrokeSound();
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setComposerText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreview({ url, isVideo: file.type.startsWith("video/") });

    e.target.value = "";
  };

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
    setMediaPreview(null);
    setMediaFile(null);
  };

  return (
    <div className="shrink-0 border-t border-[var(--chat-border)] px-3 py-2.5 sm:px-4 sm:py-3">
      {mediaPreview && (
        <div className="relative mb-2 inline-block">
          {mediaPreview.isVideo ? (
            <video
              src={mediaPreview.url}
              className="h-28 rounded-lg border border-[var(--chat-border)] object-cover"
            />
          ) : (
            <img
              src={mediaPreview.url}
              alt="Preview"
              className="h-28 rounded-lg border border-[var(--chat-border)] object-cover"
            />
          )}
          <button
            type="button"
            onClick={clearMedia}
            disabled={isSendingMedia}
            aria-label="Remove attachment"
            className="absolute -right-2 -top-2 rounded-full bg-[var(--chat-elevated)] p-0.5 text-[var(--chat-muted)] shadow-md transition-colors hover:text-[var(--chat-text)] disabled:opacity-40"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elevated)] px-3 py-2 transition-colors focus-within:border-[var(--chat-border-strong)]">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSendingMedia}
          aria-label="Attach image or video"
          className="mb-0.5 shrink-0 rounded-lg p-1.5 text-[var(--chat-faint)] transition-colors hover:text-[var(--chat-accent)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ImagePlus className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={composerText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isSendingMedia}
          // 16px on phones: iOS Safari zooms the page in on focus for anything
          // smaller, which leaves the thread scrolled sideways.
          className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-base leading-snug text-[var(--chat-text)] placeholder-[var(--chat-faint)] outline-none disabled:opacity-40 sm:text-[15px]"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || isSendingMedia}
          aria-label="Send message"
          className="mb-0.5 shrink-0 rounded-lg p-1.5 text-[var(--chat-accent)] transition-all hover:bg-[var(--chat-accent)]/10 disabled:pointer-events-none disabled:opacity-30"
        >
          {isSendingMedia ? (
            <Loader className="h-5 w-5 animate-spin" strokeWidth={2} />
          ) : (
            <SendHorizontal className="h-5 w-5" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
};

export default ChatComposer;
