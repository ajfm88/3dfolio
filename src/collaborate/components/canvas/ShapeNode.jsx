import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

import { HANDLE_IDS } from "@shared/canvasOps.js";

const HANDLE_POSITIONS = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

// Insets follow each axis; percentage padding would use width even vertically.
const LABEL_LAYERS = {
  rectangle: "inset-0 px-3 py-2",
  pill: "inset-0 px-3 py-2",
  circle: "inset-[15%]",
  diamond: "inset-[25%]",
  hexagon: "inset-y-0 inset-x-[20%] py-2",
  cylinder: "inset-x-0 bottom-0 top-[24%] px-3 pb-2",
};

const CssBody = ({ shape, color, selected }) => (
  <div
    className={`absolute inset-0 border ${shape === "rectangle" ? "rounded-lg" : "rounded-full"} ${selected ? "border-[var(--collab-node-border-selected)]" : "border-[var(--collab-node-border)]"}`}
    style={{ backgroundColor: color }}
  />
);

// preserveAspectRatio stretches to either axis; non-scaling-stroke keeps borders
// at 1px, and visible overflow preserves the stroke outside the pointed corners.
const SvgBody = ({ shape, color, selected }) => {
  const stroke = selected ? "var(--collab-node-border-selected)" : "var(--collab-node-border)";
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible" className="absolute inset-0 h-full w-full">
      {shape === "diamond" && (
        <polygon points="50,0 100,50 50,100 0,50" style={{ fill: color }} stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {shape === "hexagon" && (
        <polygon points="25,0 75,0 100,50 75,100 25,100 0,50" style={{ fill: color }} stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {shape === "cylinder" && (
        <>
          <path d="M0,12 A50,12 0 0 1 100,12 L100,88 A50,12 0 0 1 0,88 Z" style={{ fill: color }} stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d="M0,12 A50,12 0 0 0 100,12" fill="none" stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
};

const ShapeNode = ({ data, selected, isConnectable }) => (
  <div className="relative h-full w-full">
    {data.shape === "rectangle" || data.shape === "pill" || data.shape === "circle" ? (
      <CssBody shape={data.shape} color={data.color} selected={selected} />
    ) : (
      <SvgBody shape={data.shape} color={data.color} selected={selected} />
    )}
    {data.label && (
      <div className={`absolute flex items-center justify-center overflow-hidden text-center ${LABEL_LAYERS[data.shape]}`} style={{ color: data.textColor }}>
        <span className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-snug">{data.label}</span>
      </div>
    )}
    {/* Handle defaults isConnectable to true and does not read nodesConnectable
        itself, so each handle needs React Flow's derived node prop. */}
    {HANDLE_IDS.map((id) => (
      <Handle key={id} id={id} type="source" position={HANDLE_POSITIONS[id]} isConnectable={isConnectable} />
    ))}
  </div>
);

// React Flow re-renders nodes on viewport and selection changes; memo skips
// nodes whose props did not change.
export default memo(ShapeNode);
