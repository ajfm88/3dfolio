import { Loader } from "lucide-react";

import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import useScrollToBottom from "../hooks/useScrollToBottom";
import MessageBubble from "./MessageBubble";

const MessageList = ({ activeConversationId }) => {
  const messages = useChatStore((s) => s.messages);
  const isMessagesLoading = useChatStore((s) => s.isMessagesLoading);
  const authUser = useAuthStore((s) => s.authUser);

  const lastMessageId = messages.at(-1)?._id;
  const scrollRef = useScrollToBottom(activeConversationId, lastMessageId);

  if (isMessagesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-[var(--chat-accent-2)]" />
      </div>
    );
  }

  if (!activeConversationId) {
    return null;
  }

  return (
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4"
    >
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--chat-muted)]">
          No messages yet. Say hello!
        </p>
      ) : (
        messages.map((msg) => (
          <MessageBubble
            key={msg._id}
            message={msg}
            isOwn={String(msg.senderId) === String(authUser?._id)}
          />
        ))
      )}
    </div>
  );
};

export default MessageList;
