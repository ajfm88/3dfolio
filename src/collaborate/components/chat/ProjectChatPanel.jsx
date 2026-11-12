import { Volume2, VolumeX, X } from "lucide-react";

import { canonicalUserId } from "../../lib/cursorPresence.js";
import { focusChatToggle, shouldCloseChatOnEscape, typingLabel, PROJECT_CHAT_PANEL_ID } from "../../lib/projectChat.js";
import { useProjectChatStore } from "../../store/useProjectChatStore.js";
import { useSessionStore } from "../../store/useSessionStore.js";
import { useWorkspaceStore } from "../../store/useWorkspaceStore.js";
import ProjectComposer from "./ProjectComposer.jsx";
import ProjectMessageList from "./ProjectMessageList.jsx";

function drawerMatches() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 1023px)").matches;
}

const ProjectChatPanel = () => {
  const setOpen = useProjectChatStore((state) => state.setOpen);
  const soundOn = useProjectChatStore((state) => state.isSoundEnabled);
  const setSoundEnabled = useProjectChatStore((state) => state.setSoundEnabled);
  const typingIds = useProjectChatStore((state) => state.typingUserIds);
  const participants = useWorkspaceStore((state) => state.participants);
  const selfId = canonicalUserId(useSessionStore((state) => state.authUser?._id));
  const names = typingIds
    .filter((id) => id !== selfId)
    .map((id) => participants.find((person) => person.userId === id)?.fullName ?? "");
  const status = typingLabel(names);

  const close = () => {
    setOpen(false);
    focusChatToggle(globalThis.document);
  };

  return (
    <aside
      id={PROJECT_CHAT_PANEL_ID}
      role="complementary"
      aria-label="Project chat"
      className="project-chat-panel flex max-h-[70%] min-h-0 w-full shrink-0 flex-col overflow-hidden border-t border-[var(--collab-border)] bg-[var(--collab-panel)] lg:max-h-none lg:w-80 lg:border-l lg:border-t-0"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (!shouldCloseChatOnEscape(event, drawerMatches())) return;
        event.preventDefault();
        close();
      }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--collab-border)] px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Chat</h2>
        <button
          type="button"
          aria-pressed={soundOn}
          aria-label={soundOn ? "Mute message sound" : "Unmute message sound"}
          className="rounded-lg p-1.5 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)]"
          onClick={() => setSoundEnabled(!soundOn)}
        >
          {soundOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Close chat"
          className="rounded-lg p-1.5 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)]"
          onClick={close}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <ProjectMessageList />
      <p className="min-h-5 shrink-0 px-3 py-1 text-xs text-[var(--collab-muted)]" aria-live="polite">
        {status}
      </p>
      <ProjectComposer />
    </aside>
  );
};

export default ProjectChatPanel;
