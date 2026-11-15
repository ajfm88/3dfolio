import { useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Circle, Cylinder, Diamond, Hexagon, LayoutTemplate, Pill, RectangleHorizontal } from "lucide-react";

import { DEFAULT_NODE_SIZE, NODE_SHAPES } from "@shared/canvasOps.js";
import { isActivationKey, SHAPE_DRAG_TYPE, shapeAtCenter } from "../../lib/shapeDrag";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

import { buildTemplateOps } from "../../lib/canvasTemplates";
import TemplatesDialog from "./TemplatesDialog";

const SHAPES = {
  rectangle: { Icon: RectangleHorizontal, title: "Rectangle" },
  diamond: { Icon: Diamond, title: "Diamond" },
  circle: { Icon: Circle, title: "Circle" },
  pill: { Icon: Pill, title: "Pill" },
  cylinder: { Icon: Cylinder, title: "Cylinder" },
  hexagon: { Icon: Hexagon, title: "Hexagon" },
};

const ShapePanel = () => {
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const ghosts = useRef({});
  const activations = useRef(0);
  const { getZoom, screenToFlowPosition, fitBounds } = useReactFlow();
  const dispatch = useWorkspaceStore((state) => state.dispatch);

  const addTemplate = (template) => {
    const surface = panelRef.current?.closest(".react-flow");
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const viewCenter = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const built = buildTemplateOps(template, useWorkspaceStore.getState().canvas.nodes, viewCenter);
    if (!built) return;
    if (dispatch(built.ops)) {
      setOpen(false);
      fitBounds(built.bounds, { padding: 0.2, duration: 200 });
    }
  };

  const addShape = (event, shape) => {
    const surface = event.currentTarget.closest(".react-flow");
    if (!surface) return;
    const count = activations.current;
    activations.current += 1;
    const node = shapeAtCenter(shape, surface.getBoundingClientRect(), screenToFlowPosition, count);
    if (node) dispatch([{ type: "node.add", node }]);
  };

  // The panel sits on the canvas. Stopping the event here keeps a drop on a
  // shape from bubbling into the canvas and landing a node under the pill.
  // preventDefault is left alone so the drag is not accepted as a drop target.
  const refuseDrop = (event) => {
    event.stopPropagation();
  };

  const onDragStart = (event, shape) => {
    event.dataTransfer.setData(SHAPE_DRAG_TYPE, shape);
    event.dataTransfer.effectAllowed = "copy";

    const zoom = getZoom();
    const width = DEFAULT_NODE_SIZE[shape].width * zoom;
    const height = DEFAULT_NODE_SIZE[shape].height * zoom;
    const ghost = ghosts.current[shape];
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    event.dataTransfer.setDragImage(ghost, width / 2, height / 2);
  };

  return (
    <>
      {/* Below sm, a higher row keeps the shapes clear of the zoom controls. */}
      <div
        ref={panelRef}
        role="toolbar"
        aria-label="Shapes"
        onDragOver={refuseDrop}
        onDrop={refuseDrop}
        className="nokey absolute bottom-16 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] p-1 backdrop-blur sm:bottom-4"
      >
        {NODE_SHAPES.map((shape) => {
          const { Icon, title } = SHAPES[shape];
          const name = title.toLowerCase();
          // Firefox does not start native drags on buttons.
          return (
            <div
              key={shape}
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Add ${name}`}
              title={`Click or drag to add a ${name}`}
              onDragStart={(event) => onDragStart(event, shape)}
              onClick={(event) => addShape(event, shape)}
              onKeyDown={(event) => {
                if (!isActivationKey(event)) return;
                event.preventDefault();
                addShape(event, shape);
              }}
              className="shrink-0 cursor-grab rounded-full p-2 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--collab-accent)] active:cursor-grabbing"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
          );
        })}
        <div aria-hidden="true" className="my-2 w-px shrink-0 bg-[var(--collab-border)]" />
        <button type="button" aria-label="Starter templates" title="Starter templates" aria-haspopup="dialog" onClick={() => setOpen(true)} className="shrink-0 rounded-full p-2 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--collab-accent)]">
          <LayoutTemplate className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {/* Portaled dialog events still bubble through React to the canvas wrapper;
          stop them here so dialog input cannot publish cursors or canvas shortcuts. */}
      <div className="contents" onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()} onDragOver={(event) => event.stopPropagation()} onDrop={(event) => event.stopPropagation()}>
        <TemplatesDialog open={open} onClose={() => setOpen(false)} onAdd={addTemplate} />
      </div>
      <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0">
        {NODE_SHAPES.map((shape) => (
          <div
            key={shape}
            ref={(element) => { ghosts.current[shape] = element; }}
            className={`flex items-center justify-center border-2 border-dashed border-[var(--collab-accent-2)] bg-[var(--collab-glass)] text-xs text-[var(--collab-muted)] ${shape === "circle" || shape === "pill" ? "rounded-full" : "rounded-lg"}`}
          >
            {SHAPES[shape].title}
          </div>
        ))}
      </div>
    </>
  );
};

export default ShapePanel;
