import {
  createNodeId,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
  NODE_SHAPES,
} from "@shared/canvasOps.js";

// Browsers lowercase dataTransfer.types, and dragover can see types but not data.
export const SHAPE_DRAG_TYPE = "application/x-collab-shape";

// Eight steps, then the offset wraps, so repeated clicks stay near the center
// without landing on the same point.
export const ACTIVATION_STEP = 24;

export function activationOffset(index) {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return 0;
  return (index % 8) * ACTIVATION_STEP;
}

export function shapeAtCenter(shape, rect, toFlow, index) {
  if (!rect || typeof rect !== "object") return null;
  const { left, top, width, height } = rect;
  if (![left, top, width, height].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if (typeof toFlow !== "function") return null;

  const point = toFlow({ x: left + width / 2, y: top + height / 2 });
  if (!point || typeof point !== "object") return null;
  if (typeof point.x !== "number" || !Number.isFinite(point.x)) return null;
  if (typeof point.y !== "number" || !Number.isFinite(point.y)) return null;

  const offset = activationOffset(index);
  return createShapeNode(shape, { x: point.x + offset, y: point.y + offset });
}

export function isActivationKey(event) {
  if (!event || typeof event !== "object") return false;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === "Enter" || event.key === " ";
}

export function createShapeNode(shape, center) {
  if (!NODE_SHAPES.includes(shape)) return null;

  const { width, height } = DEFAULT_NODE_SIZE[shape];
  return {
    id: createNodeId(),
    type: "shape",
    position: { x: center.x - width / 2, y: center.y - height / 2 },
    width,
    height,
    data: {
      label: "",
      shape,
      color: DEFAULT_NODE_COLOR.fill,
      textColor: DEFAULT_NODE_COLOR.text,
    },
  };
}
