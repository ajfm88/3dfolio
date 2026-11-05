import {
  createNodeId,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
  NODE_SHAPES,
} from "@shared/canvasOps.js";

// Browsers lowercase dataTransfer.types, and dragover can see types but not data.
export const SHAPE_DRAG_TYPE = "application/x-collab-shape";

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
