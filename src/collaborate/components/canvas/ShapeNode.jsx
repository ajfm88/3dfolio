import { memo, useCallback, useEffect, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";

import { HANDLE_IDS, NODE_SIZE_MAX, NODE_SIZE_MIN } from "@shared/canvasOps.js";
import { selectCanEdit, useWorkspaceStore } from "../../store/useWorkspaceStore";
import ColorToolbar from "./ColorToolbar";
import NodeLabelEditor from "./NodeLabelEditor";

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

function isEditSurface(target) {
  return target instanceof Element
    && !target.closest(".react-flow__handle, .react-flow__resize-control, .collab-color-toolbar, .react-flow__node-toolbar, textarea");
}

// The bodies stay props-only. Editability, the label session, and the resize
// commit live here because those controls have to sit on the node.
const ShapeNode = ({ id, data, selected, isConnectable }) => {
  const canEdit = useWorkspaceStore(selectCanEdit);
  const commitNodeResize = useWorkspaceStore((s) => s.commitNodeResize);
  const [editing, setEditing] = useState(false);
  const onResizeEnd = useCallback((_event, params) => {
    commitNodeResize(id, params);
  }, [commitNodeResize, id]);
  const closeEditor = useCallback(() => setEditing(false), []);

  // Losing edit permission drops the draft. Restoring it must not reopen the
  // session. Selection is left alone so a pane click can still blur-commit.
  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  // React Flow's double-click zoom is a native listener on an ancestor. A
  // bubble handler runs too late to stop it, so the edit starts in capture.
  const onDoubleClickCapture = (event) => {
    if (!canEdit || !isEditSurface(event.target)) return;
    event.stopPropagation();
    if (!editing) setEditing(true);
  };

  return (
    <div className="relative h-full w-full" onDoubleClickCapture={onDoubleClickCapture}>
      {data.shape === "rectangle" || data.shape === "pill" || data.shape === "circle" ? (
        <CssBody shape={data.shape} color={data.color} selected={selected} />
      ) : (
        <SvgBody shape={data.shape} color={data.color} selected={selected} />
      )}
      {(editing || data.label) && (
        <div className={`absolute flex items-center justify-center overflow-hidden text-center ${LABEL_LAYERS[data.shape]}`} style={{ color: data.textColor }}>
          {editing ? (
            <NodeLabelEditor id={id} initialLabel={data.label ?? ""} onClose={closeEditor} />
          ) : (
            <span className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium leading-snug">{data.label}</span>
          )}
        </div>
      )}
      {canEdit && !editing && (
        <ColorToolbar id={id} color={data.color} textColor={data.textColor} />
      )}
      {/* The shape body is absolute and would cover controls drawn before it.
          Connection handles stay last so they win the midpoint hit target. */}
      <NodeResizer
        isVisible={selected && canEdit && !editing}
        minWidth={NODE_SIZE_MIN}
        minHeight={NODE_SIZE_MIN}
        maxWidth={NODE_SIZE_MAX}
        maxHeight={NODE_SIZE_MAX}
        keepAspectRatio={false}
        handleClassName="collab-resize-handle"
        lineClassName="collab-resize-line"
        onResizeEnd={onResizeEnd}
      />
      {/* Handle defaults isConnectable to true and does not read nodesConnectable
          itself, so each handle needs React Flow's derived node prop. */}
      {HANDLE_IDS.map((handleId) => (
        <Handle
          key={handleId}
          id={handleId}
          type="source"
          position={HANDLE_POSITIONS[handleId]}
          isConnectable={editing ? false : isConnectable}
        />
      ))}
    </div>
  );
};

// React Flow re-renders nodes on viewport and selection changes; memo skips
// nodes whose props did not change.
export default memo(ShapeNode);
