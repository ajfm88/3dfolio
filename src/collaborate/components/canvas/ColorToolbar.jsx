import { NodeToolbar, Position } from "@xyflow/react";

import { NODE_COLORS } from "@shared/canvasOps.js";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

function stop(event) {
  event.stopPropagation();
}

// The toolbar is portaled into the same element React Flow uses for double-click
// zoom. A bubble-phase stop runs after that native listener, so the zoom is
// stopped from capture. Pointer and mouse both stop because the portal still
// bubbles through this node in React, and the canvas listens natively.
const ColorToolbar = ({ id, color, textColor }) => {
  const setNodeColor = useWorkspaceStore((s) => s.setNodeColor);

  return (
    <NodeToolbar className="nopan nodrag nowheel nokey" position={Position.Top} offset={12}>
      <div
        role="group"
        aria-label="Node colors"
        className="collab-color-toolbar nopan nodrag nowheel nokey flex items-center gap-1 rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] p-1 backdrop-blur"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        onDoubleClickCapture={stop}
        onKeyDown={stop}
        onKeyUp={stop}
      >
        {NODE_COLORS.map((pair) => {
          const active = color === pair.fill && textColor === pair.text;
          return (
            <button
              key={pair.name}
              type="button"
              title={pair.name}
              aria-label={`${pair.name} node color`}
              aria-pressed={active}
              className="nopan nodrag nowheel nokey box-border h-5 w-5 rounded-full border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--collab-accent)]"
              style={{ backgroundColor: pair.fill, borderColor: active ? pair.text : "transparent" }}
              onPointerDown={stop}
              onMouseDown={stop}
              onDoubleClickCapture={stop}
              onKeyDown={stop}
              onKeyUp={stop}
              onClick={(event) => {
                stop(event);
                setNodeColor(id, pair.name);
              }}
            >
            </button>
          );
        })}
      </div>
    </NodeToolbar>
  );
};

export default ColorToolbar;
