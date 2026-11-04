import { useReactFlow } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";

const buttonClass =
  "rounded-full p-2 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)]";

const CanvasControls = () => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] p-1 backdrop-blur">
      <button type="button" aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })} className={buttonClass}>
        <Plus className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })} className={buttonClass}>
        <Minus className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Fit to screen" onClick={() => fitView({ duration: 200 })} className={buttonClass}>
        <Maximize className="h-5 w-5" />
      </button>
    </div>
  );
};

export default CanvasControls;
