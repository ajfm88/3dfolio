import { useEffect } from "react";

import { alejandro } from "../../assets";
import ChatSidebar from "../components/ChatSidebar";
import ChatHeader from "../components/ChatHeader";
import MessageList from "../components/MessageList";
import ChatComposer from "../components/ChatComposer";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import useVisualViewportHeight from "../hooks/useVisualViewportHeight";

const ChatPage = () => {
  const getUsers = useChatStore((s) => s.getUsers);
  const getConversations = useChatStore((s) => s.getConversations);
  const getMessages = useChatStore((s) => s.getMessages);
  const subscribeToMessages = useChatStore((s) => s.subscribeToMessages);
  const unsubscribeFromMessages = useChatStore((s) => s.unsubscribeFromMessages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const selectedUser = useChatStore((s) => s.selectedUser);
  const socket = useAuthStore((s) => s.socket);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const viewportHeight = useVisualViewportHeight();

  useEffect(() => {
    getUsers();
    getConversations();
  }, [getUsers, getConversations]);

  // Keyed on the socket rather than on mount: the connection is opened
  // asynchronously by checkAuth, so a mount-only effect would run while it is
  // still null and silently never subscribe.
  useEffect(() => {
    if (!socket) return;
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [socket, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (!activeConversationId) return;
    getMessages(activeConversationId);
  }, [activeConversationId, getMessages]);

  return (
    <div
      // On phones the shell follows the visual viewport so the composer stays
      // above the on-screen keyboard; desktop keeps the plain dvh class.
      style={!isLargeScreen && viewportHeight ? { height: viewportHeight } : undefined}
      className="flex h-[100dvh] flex-col overflow-hidden p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:p-6"
    >
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
