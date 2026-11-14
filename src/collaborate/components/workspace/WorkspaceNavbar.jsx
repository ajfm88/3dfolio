import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { PROJECT_CHAT_PANEL_ID, PROJECT_CHAT_TOGGLE_ID, unreadBadge, unreadLabel } from "../../lib/projectChat.js";
import { useProjectChatStore } from "../../store/useProjectChatStore.js";
import RoleBadge from "../ui/RoleBadge";
import ParticipantStack from "./ParticipantStack";
import ShareDialog from "./ShareDialog";
import { useShareStore } from "../../store/useShareStore";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

const WorkspaceNavbar = () => {
  const [shareOpen, setShareOpen] = useState(false);
  const projectId = useWorkspaceStore((s) => s.project?._id);
  const status = useWorkspaceStore((s) => s.status);
  const openShare = useShareStore((s) => s.open);
  const closeShare = useShareStore((s) => s.close);
  const shareStatus = useShareStore((s) => s.status);
  useEffect(() => {
    if (!shareOpen || !projectId) return;
    openShare(projectId);
    return () => closeShare();
  }, [shareOpen, projectId, openShare, closeShare]);
  // A 404 or completed leave closes the store independently of the button.
  useEffect(() => {
    if (shareOpen && shareStatus === "idle" && useShareStore.getState().status === "idle") setShareOpen(false);
  }, [shareOpen, shareStatus]);
  const name = useWorkspaceStore((s) => s.project?.name ?? "");
  const role = useWorkspaceStore((s) => s.role);
  const chatOpen = useProjectChatStore((s) => s.isOpen);
  const unread = useProjectChatStore((s) => s.unreadCount);
  const toggleOpen = useProjectChatStore((s) => s.toggleOpen);
  const badge = unreadBadge(unread);

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 overflow-hidden border-b border-[var(--collab-border)] bg-[var(--collab-panel)] px-2 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
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
      {status === "ready" && <button type="button" aria-label="Share project" aria-haspopup="dialog" onClick={() => setShareOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--collab-border)] px-2 py-1 text-sm"><Users className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Share</span></button>}
      {shareOpen && <ShareDialog open onClose={() => setShareOpen(false)} projectId={projectId} />}
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
