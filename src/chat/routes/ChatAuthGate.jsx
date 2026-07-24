import { SignInButton } from "@clerk/clerk-react";

import { alejandro } from "../../assets";

// Signed-out gate for /chat. The entire chat experience needs a Clerk session —
// every message API call sits behind protectRoute — so rather than drop a
// signed-out visitor into an inert shell, they get this prompt. Sign-in opens as
// a Clerk modal (same as the blog), so we never navigate away from the page.
//
// This is the reference app's two-panel auth hero restyled down to a single
// Tailwind 3 card: HeroUI and the wallpaper/theme pickers were dropped under the
// single-Tailwind plan, keeping just the essential sign-in call to action.
const ChatAuthGate = () => (
  <div className="flex min-h-[100dvh] items-center justify-center p-4 sm:p-6">
    <div className="w-full max-w-md rounded-3xl border border-[var(--chat-border)] bg-[var(--chat-glass)] px-6 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur sm:px-10">
      <div className="mb-6 flex justify-center">
        <div className="rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-elevated)] p-3 animate-[chat-float-y_4.5s_ease-in-out_infinite] motion-reduce:animate-none">
          <img src={alejandro} alt="" className="h-12 w-12 object-contain" />
        </div>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--chat-accent-2)]">
        Secure entry
      </p>
      <h1 className="mt-3 text-2xl font-bold text-[var(--chat-text)]">ajfm88 Chat</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--chat-muted)]">
        Real-time messaging with photos and presence. Sign in to start a conversation.
      </p>

      <SignInButton mode="modal" fallbackRedirectUrl="/chat">
        <button
          type="button"
          className="mt-8 w-full rounded-2xl bg-gradient-to-b from-[#9d5cff] to-[#7042f8] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_var(--chat-accent-glow)] transition-transform hover:-translate-y-0.5"
        >
          Continue
        </button>
      </SignInButton>

      <div className="mt-8 flex items-center justify-center gap-2 border-t border-[var(--chat-border)] pt-6 text-[11px] text-[var(--chat-faint)]">
        <span>Protected session · TLS encryption</span>
      </div>
    </div>
  </div>
);

export default ChatAuthGate;
