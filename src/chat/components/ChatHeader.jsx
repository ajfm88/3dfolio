import { ChevronLeft, X } from "lucide-react";

import { alejandro } from "../../assets";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { getInitials } from "../lib/utils";
import AvatarWithOnlineIndicator from "./AvatarWithOnlineIndicator";

const ChatHeader = ({ selectedUser }) => {
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const isOnline = selectedUser ? onlineUsers.includes(selectedUser._id) : false;

  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[var(--chat-border)] px-2 py-2 sm:px-3">
      {selectedUser && !isLargeScreen && (
        <button
          type="button"
          onClick={() => setActiveConversationId(null)}
          className="shrink-0 rounded-lg p-1 text-[var(--chat-muted)] transition-colors hover:bg-[var(--chat-elevated)] hover:text-[var(--chat-text)]"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
        </button>
      )}

      {selectedUser ? (
        <>
          <AvatarWithOnlineIndicator isOnline={isOnline}>
            {selectedUser.profilePic ? (
              <img
                src={selectedUser.profilePic}
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
            <p className="truncate text-xs text-[var(--chat-muted)]">
              {isOnline ? (
                <span className="font-medium text-emerald-400">Online</span>
              ) : (
                "Offline"
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveConversationId(null)}
            aria-label="Close chat"
            className="ml-auto shrink-0 rounded-lg p-1.5 text-[var(--chat-muted)] transition-colors hover:bg-[var(--chat-elevated)] hover:text-[var(--chat-text)]"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-2.5">
          <img src={alejandro} alt="" className="h-9 w-9 rounded-xl object-contain" />
          <p className="truncate text-sm font-medium text-[var(--chat-muted)]">
            Select a conversation
          </p>
        </div>
      )}
    </header>
  );
};

export default ChatHeader;
