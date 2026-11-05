import { useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { Circle, Cylinder, Diamond, Hexagon, Pill, RectangleHorizontal } from "lucide-react";

import { DEFAULT_NODE_SIZE, NODE_SHAPES } from "@shared/canvasOps.js";
import { SHAPE_DRAG_TYPE } from "../../lib/shapeDrag";

const SHAPES = {
  rectangle: { Icon: RectangleHorizontal, title: "Rectangle" },
  diamond: { Icon: Diamond, title: "Diamond" },
  circle: { Icon: Circle, title: "Circle" },
  pill: { Icon: Pill, title: "Pill" },
  cylinder: { Icon: Cylinder, title: "Cylinder" },
  hexagon: { Icon: Hexagon, title: "Hexagon" },
};

const ShapePanel = () => {
  const ghosts = useRef({});
  const { getZoom } = useReactFlow();

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
        role="toolbar"
        aria-label="Shapes"
        className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] p-1 backdrop-blur sm:bottom-4"
      >
        {NODE_SHAPES.map((shape) => {
          const { Icon, title } = SHAPES[shape];
          // Firefox does not start native drags on buttons.
          return (
            <div
              key={shape}
              draggable
              onDragStart={(event) => onDragStart(event, shape)}
              title={`Drag to add a ${title.toLowerCase()}`}
              className="cursor-grab rounded-full p-2 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)] active:cursor-grabbing"
            >
              <Icon className="h-5 w-5" />
              <span className="sr-only">{title}</span>
            </div>
          );
        })}
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
