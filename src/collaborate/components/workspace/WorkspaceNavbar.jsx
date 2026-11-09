import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import RoleBadge from "../ui/RoleBadge";
import ParticipantStack from "./ParticipantStack";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

const WorkspaceNavbar = () => {
  const name = useWorkspaceStore((s) => s.project?.name ?? "");
  const role = useWorkspaceStore((s) => s.role);

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
    </header>
  );
};

export default WorkspaceNavbar;
