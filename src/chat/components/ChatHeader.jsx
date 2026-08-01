import { ChevronLeft, Volume2, VolumeX, X } from "lucide-react";

import { LOGO_SRC, LOGO_ALT } from "../../constants/brand";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { getInitials } from "../lib/utils";
import AvatarWithOnlineIndicator from "./AvatarWithOnlineIndicator";

const ChatHeader = ({ selectedUser }) => {
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const isSoundEnabled = useChatStore((s) => s.isSoundEnabled);
  const setSoundEnabled = useChatStore((s) => s.setSoundEnabled);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const isOnline = selectedUser ? onlineUsers.includes(selectedUser._id) : false;
  const isTyping = selectedUser ? typingUsers.includes(selectedUser._id) : false;

  // Governs both the typing clicks and the incoming-message chime, and is the
  // one piece of chat state kept in localStorage.
  const soundToggle = (
    <button
      type="button"
      onClick={() => setSoundEnabled(!isSoundEnabled)}
      aria-pressed={isSoundEnabled}
      aria-label={isSoundEnabled ? "Mute chat sounds" : "Unmute chat sounds"}
      title={isSoundEnabled ? "Mute sounds" : "Unmute sounds"}
      className="shrink-0 rounded-lg p-2 text-[var(--chat-muted)] transition-colors hover:bg-[var(--chat-elevated)] hover:text-[var(--chat-text)]"
    >
      {isSoundEnabled ? (
        <Volume2 className="h-5 w-5" strokeWidth={2} />
      ) : (
        <VolumeX className="h-5 w-5" strokeWidth={2} />
      )}
    </button>
  );

  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[var(--chat-border)] px-2 py-2 sm:px-3">
      {selectedUser && !isLargeScreen && (
        <button
          type="button"
          onClick={() => setActiveConversationId(null)}
          aria-label="Back to conversations"
          className="-ml-1 shrink-0 rounded-lg p-2 text-[var(--chat-muted)] transition-colors hover:bg-[var(--chat-elevated)] hover:text-[var(--chat-text)]"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
        </button>
      )}

      {selectedUser ? (
        <>
          <AvatarWithOnlineIndicator isOnline={isOnline}>
            {selectedUser.img ? (
              <img
                src={selectedUser.img}
                alt={selectedUser.fullName}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-sm font-medium text-white">
                {getInitials(selectedUser.fullName)}
              </div>
            )}
          </AvatarWithOnlineIndicator>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-[var(--chat-text)]">
              {selectedUser.fullName}
            </p>
            {/* Typing outranks Online: it implies presence and is the more
                specific thing to say about someone who is doing both. */}
            <p className="truncate text-xs text-[var(--chat-muted)]">
              {isTyping ? (
                <span className="font-medium text-[var(--chat-accent-2)]">typing…</span>
              ) : isOnline ? (
                <span className="font-medium text-emerald-400">Online</span>
              ) : (
                "Offline"
              )}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center">
            {soundToggle}

            {/* Below lg the chevron already closes the thread, so this would be
                a second control doing the same job in a cramped header. */}
            <button
              type="button"
              onClick={() => setActiveConversationId(null)}
              aria-label="Close chat"
              className="hidden shrink-0 rounded-lg p-2 text-[var(--chat-muted)] transition-colors hover:bg-[var(--chat-elevated)] hover:text-[var(--chat-text)] lg:block"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <img src={LOGO_SRC} alt={LOGO_ALT} className="h-9 w-9 rounded-xl object-contain" />
            <p className="truncate text-sm font-medium text-[var(--chat-muted)]">
              Select a conversation
            </p>
          </div>
          {soundToggle}
        </>
      )}
    </header>
  );
};

export default ChatHeader;
