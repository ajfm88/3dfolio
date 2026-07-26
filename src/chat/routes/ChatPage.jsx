import { useEffect } from "react";

import { alejandro } from "../../assets";
import ChatSidebar from "../components/ChatSidebar";
import ChatHeader from "../components/ChatHeader";
import MessageList from "../components/MessageList";
import ChatComposer from "../components/ChatComposer";
import { useChatStore } from "../store/useChatStore";
import { useMediaQuery } from "../hooks/useMediaQuery";

const ChatPage = () => {
  const getUsers = useChatStore((s) => s.getUsers);
  const getConversations = useChatStore((s) => s.getConversations);
  const getMessages = useChatStore((s) => s.getMessages);
  const subscribeToMessages = useChatStore((s) => s.subscribeToMessages);
  const unsubscribeFromMessages = useChatStore((s) => s.unsubscribeFromMessages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    getUsers();
    getConversations();
  }, [getUsers, getConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    getMessages(activeConversationId);
    subscribeToMessages(activeConversationId);
    return () => unsubscribeFromMessages();
  }, [activeConversationId, getMessages, subscribeToMessages, unsubscribeFromMessages]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden p-2 sm:p-3 md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-panel)] shadow-2xl shadow-black/40">
        <ChatSidebar activeConversationId={activeConversationId} />

        {/* Conversation pane */}
        <section
          className={`flex-1 flex-col overflow-hidden ${
            !isLargeScreen && !activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          <ChatHeader selectedUser={selectedUser} />
          <MessageList activeConversationId={activeConversationId} />

          {selectedUser && (
            <ChatComposer activeConversationId={activeConversationId} />
          )}
        </section>
      </div>
    </div>
  );
};

export default ChatPage;
