import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import WorkspaceCanvas from "../components/canvas/WorkspaceCanvas";
import ConnectionBanner from "../components/workspace/ConnectionBanner";
import TurnBar from "../components/workspace/TurnBar";
import WorkspaceNavbar from "../components/workspace/WorkspaceNavbar";
import { useSessionStore } from "../store/useSessionStore";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

// Same spinner as CollaborateLoader. It stays local so the dashboard module
// does not have to export a piece only the workspace uses.
const spinnerClass = "h-8 w-8 animate-spin rounded-full border-2 border-[var(--collab-border-strong)] border-t-[var(--collab-accent-2)]";

const WorkspaceLoader = () => (
  <div className="flex min-h-[100dvh] items-center justify-center">
    <div className={spinnerClass} />
  </div>
);

const cardFrame =
  "flex min-h-[100dvh] items-center justify-center p-4 sm:p-6";
const cardClass =
  "w-full max-w-md rounded-3xl border border-[var(--collab-border)] bg-[var(--collab-glass)] px-6 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur sm:px-10";
const actionClass =
  "mt-8 block w-full rounded-2xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-6 py-3.5 text-center text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_var(--collab-accent-glow)] transition-transform hover:-translate-y-0.5";

const NotFoundCard = () => (
  <div className={cardFrame}>
    <div className={cardClass}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">Collaborate</p>
      <h1 className="mt-3 text-2xl font-bold">Project not found</h1>
      <p className="mt-3 text-sm text-[var(--collab-muted)]">It may have been deleted, or you don't have access.</p>
      <Link to="/collaborate" className={actionClass}>
        Back to projects
      </Link>
    </div>
  </div>
);

const ErrorCard = () => {
  const retryWorkspace = useWorkspaceStore((s) => s.retryWorkspace);

  return (
    <div className={cardFrame}>
      <div className={cardClass}>
        <h1 className="text-2xl font-bold">We couldn't open this project</h1>
        <p className="mt-3 text-sm text-[var(--collab-muted)]">Check your connection and try again.</p>
        <button type="button" onClick={() => retryWorkspace()} className={actionClass}>
          Try again
        </button>
      </div>
    </div>
  );
};

const WorkspacePage = () => {
  const { projectId } = useParams();
  const socket = useSessionStore((s) => s.socket);
  const status = useWorkspaceStore((s) => s.status);
  const connectionNotice = useWorkspaceStore((s) => s.connectionNotice);
  const bindWorkspace = useWorkspaceStore((s) => s.bindWorkspace);

  useEffect(() => {
    return bindWorkspace(socket, projectId);
  }, [socket, projectId, bindWorkspace]);

  if (status === "notFound") return <NotFoundCard />;
  if (status === "error") return <ErrorCard />;

  if ((status === "idle" || status === "loading") && !connectionNotice) return <WorkspaceLoader />;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <WorkspaceNavbar />
      <ConnectionBanner />
      {status === "idle" || status === "loading" ? (
        <main className="flex min-h-0 flex-1 items-center justify-center">
          <div className={spinnerClass} />
        </main>
      ) : (
        <main className="relative min-h-0 flex-1">
          <WorkspaceCanvas />
          <TurnBar />
        </main>
      )}
    </div>
  );
};

export default WorkspacePage;
