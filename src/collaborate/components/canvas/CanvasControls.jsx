import { useReactFlow } from "@xyflow/react";
import { Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react";

import { selectCanRedo, selectCanUndo, useWorkspaceStore } from "../../store/useWorkspaceStore";

const buttonClass =
  "rounded-full p-2 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--collab-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--collab-muted)]";

const REPLAY_LABEL = { undo: "Undoing…", redo: "Redoing…" };

const CanvasControls = () => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const canUndo = useWorkspaceStore(selectCanUndo);
  const canRedo = useWorkspaceStore(selectCanRedo);
  const replay = useWorkspaceStore((s) => s.history?.replay ?? null);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  return (
    <div data-collab-chrome className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] p-1 backdrop-blur">
      <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => undo()} className={buttonClass}>
        <Undo2 className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => redo()} className={buttonClass}>
        <Redo2 className="h-5 w-5" />
      </button>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[var(--collab-border)]" />
      <button type="button" aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })} className={buttonClass}>
        <Plus className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })} className={buttonClass}>
        <Minus className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Fit to screen" onClick={() => fitView({ duration: 200 })} className={buttonClass}>
        <Maximize className="h-5 w-5" />
      </button>
      <span role="status" aria-live="polite" className="px-2 text-xs text-[var(--collab-muted)] empty:hidden">
        {replay ? REPLAY_LABEL[replay] : ""}
      </span>
    </div>
  );
};

export default CanvasControls;
