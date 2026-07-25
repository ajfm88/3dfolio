import { UserButton } from "@clerk/clerk-react";
import { MessageSquare, Users, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import { alejandro } from "../../assets";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { getInitials } from "../lib/utils";
import ConversationRow from "./ConversationRow";

function mapUserForList(user, onlineUsers) {
  return {
    _id: user._id,
    name: user.fullName,
    avatarUrl: user.profilePic,
    initials: getInitials(user.fullName),
    isOnline: onlineUsers.includes(user._id),
  };
}

const ChatSidebar = ({ activeConversationId }) => {
  const conversations = useChatStore((s) => s.conversations);
  const users = useChatStore((s) => s.users);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const sidebarTab = useChatStore((s) => s.sidebarTab);
  const setSidebarTab = useChatStore((s) => s.setSidebarTab);
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const onlineUsers = useAuthStore((s) => s.onlineUsers);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const query = searchQuery.trim().toLowerCase();

  const conversationUsers = conversations.map((u) => mapUserForList(u, onlineUsers));
  const allUsers = users.map((u) => mapUserForList(u, onlineUsers));

  const filteredConversations = query
    ? conversationUsers.filter((c) => c.name.toLowerCase().includes(query))
    : conversationUsers;

  const filteredUsers = query
    ? allUsers.filter((u) => u.name.toLowerCase().includes(query))
    : allUsers;

  const list = sidebarTab === "chats" ? filteredConversations : filteredUsers;
  const emptyLabel =
    sidebarTab === "chats"
      ? query
        ? "No conversations match your search."
        : "No conversations yet. Start one from the Users tab."
      : query
        ? "No people match your search."
        : "No users found.";

  return (
    <aside
      className={`w-full shrink-0 flex-col overflow-hidden border-r border-[var(--chat-border)] bg-[var(--chat-panel-2)] lg:w-80 lg:max-w-sm ${!isLargeScreen && activeConversationId ? "hidden lg:flex" : "flex"}`}
    >
      {/* Brand + account row */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--chat-border)] px-4 py-3">
        <img src={alejandro} alt="" className="h-8 w-8 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--chat-text)]">ajfm88 Chat</p>
          <Link
            to="/"
            className="text-xs text-[var(--chat-muted)] transition-colors hover:text-[var(--chat-accent-2)]"
          >
            &larr; Back to portfolio
          </Link>
        </div>
        <UserButton />
      </header>

      {/* Search */}
      <div className="shrink-0 border-b border-[var(--chat-border)] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--chat-faint)]" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elevated)] py-2 pl-9 pr-8 text-sm text-[var(--chat-text)] placeholder-[var(--chat-faint)] outline-none transition-colors focus:border-[var(--chat-accent)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--chat-faint)] transition-colors hover:text-[var(--chat-text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-[var(--chat-border)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setSidebarTab("chats")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors ${sidebarTab === "chats" ? "bg-[var(--chat-elevated)] text-[var(--chat-text)]" : "text-[var(--chat-muted)] hover:text-[var(--chat-text)]"}`}
        >
          <MessageSquare className="h-3.5 w-3.5 opacity-80" aria-hidden />
          Chats
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab("users")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors ${sidebarTab === "users" ? "bg-[var(--chat-elevated)] text-[var(--chat-text)]" : "text-[var(--chat-muted)] hover:text-[var(--chat-text)]"}`}
        >
          <Users className="h-3.5 w-3.5 opacity-80" aria-hidden />
          Users
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--chat-muted)]">{emptyLabel}</p>
        ) : (
          list.map((item) => (
            <ConversationRow
              key={item._id}
              user={item}
              selected={item._id === activeConversationId}
              onSelect={() => setActiveConversationId(item._id)}
            />
          ))
        )}
      </div>
    </aside>
  );
};

export default ChatSidebar;
