import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

// Placeholder until S07 adds the workspace canvas.
const WorkspacePage = () => {
  const { projectId } = useParams();

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link to="/collaborate" className="inline-flex items-center gap-2 text-sm text-[var(--collab-accent-2)]">
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Workspace</h1>
      <p className="mt-3 font-mono text-xs text-[var(--collab-faint)]">{projectId}</p>
    </div>
  );
};

export default WorkspacePage;
