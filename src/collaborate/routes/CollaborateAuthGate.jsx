import { SignInButton } from "@clerk/clerk-react";

import { LOGO_SRC, LOGO_ALT } from "../../constants/brand";

// Projects require a Clerk session, so signed-out visitors get one clear
// entry point. The modal keeps the current URL, including workspace deep links.
// The single card follows chat's layout without importing its feature code.
const CollaborateAuthGate = () => (
  <div className="flex min-h-[100dvh] items-center justify-center p-4 sm:p-6">
    <div className="w-full max-w-md rounded-3xl border border-[var(--collab-border)] bg-[var(--collab-glass)] px-6 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur sm:px-10">
      <div className="mb-6 flex justify-center">
        <div className="rounded-2xl border border-[var(--collab-border-strong)] bg-[var(--collab-elevated)] p-3 animate-[collab-float-y_4.5s_ease-in-out_infinite] motion-reduce:animate-none">
          <img src={LOGO_SRC} alt={LOGO_ALT} className="h-12 w-12 object-contain" />
        </div>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">
        Secure entry
      </p>
      <h1 className="mt-3 text-2xl font-bold text-[var(--collab-text)]">ajfm88 Collaborate</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--collab-muted)]">
        Design software architectures together on a shared canvas, one editor at a time. Sign in to see your projects.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-8 w-full rounded-2xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_var(--collab-accent-glow)] transition-transform hover:-translate-y-0.5"
        >
          Continue
        </button>
      </SignInButton>
      <div className="mt-8 flex items-center justify-center gap-2 border-t border-[var(--collab-border)] pt-6 text-[11px] text-[var(--collab-faint)]">
        <span>Protected session · TLS encryption</span>
      </div>
    </div>
  </div>
);

export default CollaborateAuthGate;
