import { selectCanEdit, useWorkspaceStore } from "../../store/useWorkspaceStore";

const HOLDER = "Click a shape below to add it, drag one onto the canvas, or start from a template.";
const VIEWER = "This canvas is empty.";
const WAITING = "This canvas is empty. Request the turn to start drawing.";

const EmptyCanvasHint = () => {
  const status = useWorkspaceStore((state) => state.status);
  const nodeCount = useWorkspaceStore((state) => state.canvas.nodes.length);
  const role = useWorkspaceStore((state) => state.role);
  const canEdit = useWorkspaceStore(selectCanEdit);

  if (status !== "ready" || nodeCount !== 0) return null;

  let text = WAITING;
  if (canEdit) text = HOLDER;
  else if (role === "viewer") text = VIEWER;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <p className="max-w-xs text-center text-sm text-[var(--collab-muted)]">{text}</p>
    </div>
  );
};

export default EmptyCanvasHint;
