import { ArrowLeft, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

import { PROJECT_CHAT_PANEL_ID, PROJECT_CHAT_TOGGLE_ID, unreadBadge, unreadLabel } from "../../lib/projectChat.js";
import { useProjectChatStore } from "../../store/useProjectChatStore.js";
import RoleBadge from "../ui/RoleBadge";
import ParticipantStack from "./ParticipantStack";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

const WorkspaceNavbar = () => {
  const name = useWorkspaceStore((s) => s.project?.name ?? "");
  const role = useWorkspaceStore((s) => s.role);
  const chatOpen = useProjectChatStore((s) => s.isOpen);
  const unread = useProjectChatStore((s) => s.unreadCount);
  const toggleOpen = useProjectChatStore((s) => s.toggleOpen);
  const badge = unreadBadge(unread);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b border-[var(--collab-border)] bg-[var(--collab-panel)] px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link to="/collaborate" className="inline-flex shrink-0 items-center gap-2 text-sm text-[var(--collab-accent-2)]">
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
        <span className="h-4 w-px shrink-0 bg-[var(--collab-border)]" aria-hidden="true" />
        <h1 className="min-w-0 truncate text-base font-semibold" title={name}>
          {name}
        </h1>
      </div>
      <ParticipantStack />
      <RoleBadge role={role} />
      <button
        id={PROJECT_CHAT_TOGGLE_ID}
        type="button"
        aria-expanded={chatOpen}
        aria-controls={PROJECT_CHAT_PANEL_ID}
        aria-label={unreadLabel(unread)}
        onClick={() => toggleOpen()}
        className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full border border-[var(--collab-border)] px-2.5 py-1 text-sm font-semibold text-[var(--collab-text)]"
      >
        <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Chat</span>
        {badge ? (
          <span className="rounded-full bg-[var(--collab-accent)] px-1.5 text-[11px] font-semibold text-white" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>
    </header>
  );
};

export default WorkspaceNavbar;
