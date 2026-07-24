import { UserButton } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

import { alejandro } from "../../assets";

// The signed-in chat shell: the two-pane frame — a conversation sidebar and the
// open-thread pane — that the following slices fill in. The sidebar's contact
// list, the message history, and the composer arrive in slices 5–7; for now each
// pane renders its empty state so the layout and its responsive behavior are
// demoable on their own.
//
// Responsive: below lg the sidebar takes the full width and the thread pane is
// hidden (the single-pane sidebar⇄thread swap lands in the mobile slice); from
// lg up both panes sit side by side.
const ChatPage = () => (
  <div className="flex h-[100dvh] flex-col overflow-hidden p-2 sm:p-3 md:p-6">
    <div className="mx-auto flex w-full max-w-6xl flex-1 overflow-hidden rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-panel)] shadow-2xl shadow-black/40">
      {/* Sidebar */}
      <aside className="flex w-full flex-col border-r border-[var(--chat-border)] bg-[var(--chat-panel-2)] lg:w-80 lg:max-w-sm">
        {/* Brand + account row */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--chat-border)] px-4 py-3">
          <img src={alejandro} alt="" className="h-8 w-8 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--chat-text)]">ajfm88 Chat</p>
            <Link
              to="/"
              className="text-xs text-[var(--chat-muted)] transition-colors hover:text-[var(--chat-accent-2)]"
            >
              ← Back to portfolio
            </Link>
          </div>
          <UserButton />
        </header>

        {/* Conversation list — populated in the next slice */}
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--chat-muted)]">
          Your conversations will appear here.
        </div>
      </aside>

      {/* Conversation pane */}
      <section className="hidden flex-1 flex-col items-center justify-center p-8 text-center lg:flex">
        <div className="max-w-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-elevated)]">
            <img src={alejandro} alt="" className="h-7 w-7 object-contain opacity-80" />
          </div>
          <p className="text-base font-medium text-[var(--chat-text)]">Select a conversation</p>
          <p className="mt-1.5 text-sm text-[var(--chat-muted)]">
            Choose someone from the sidebar to start messaging.
          </p>
        </div>
      </section>
    </div>
  </div>
);

export default ChatPage;
