import { memo, useCallback, useEffect, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useInternalNode, useStoreApi } from "@xyflow/react";

import { selfLoopGeometry } from "../../lib/edgePath";
import { selectCanEdit, useWorkspaceStore } from "../../store/useWorkspaceStore";
import EdgeLabelEditor from "./EdgeLabelEditor";

function nodeBox(node) {
  if (!node) return null;
  const x = node.internals?.positionAbsolute?.x;
  const y = node.internals?.positionAbsolute?.y;
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  if (![x, y, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function isEditorTarget(target) {
  return target instanceof Element && Boolean(target.closest("textarea, .collab-edge-editor"));
}

// Parallel edges share this route and may draw on top of each other. Each
// still has its own id; separating lanes is outside this slice.
const LinkEdge = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}) => {
  const canEdit = useWorkspaceStore(selectCanEdit);
  const selectEdge = useWorkspaceStore((s) => s.selectEdge);
  const flow = useStoreApi();
  const sourceNode = useInternalNode(source);
  const [editing, setEditing] = useState(false);
  const closeEditor = useCallback(() => setEditing(false), []);
  const label = data?.label ?? "";

  // Losing edit permission drops the draft. Restoring it must not reopen the
  // session. Selection is left alone so a pane click can still blur-commit.
  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  let path = "";
  let labelX = sourceX;
  let labelY = sourceY;
  if (source === target) {
    const loop = selfLoopGeometry({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      box: nodeBox(sourceNode),
    });
    path = loop.path;
    labelX = loop.labelX;
    labelY = loop.labelY;
  } else if ([sourceX, sourceY, targetX, targetY].every((value) => Number.isFinite(value))) {
    const smooth = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    path = smooth[0];
    labelX = smooth[1];
    labelY = smooth[2];
  }

  const openEditor = (event) => {
    if (!canEdit || isEditorTarget(event.target)) return;
    // React Flow zooms from a native listener on an ancestor. Capture runs
    // before that bubble, which a handler on the edge wrapper does not.
    event.stopPropagation();
    event.preventDefault();
    if (!selected) selectEdge(id, false);
    setEditing(true);
  };

  const onLabelClick = (event) => {
    if (isEditorTarget(event.target)) return;
    event.stopPropagation();
    selectEdge(id, flow.getState().multiSelectionActive);
  };

  const showLabel = editing || label !== "";

  return (
    <>
      <g onDoubleClickCapture={openEditor}>
        <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={20} />
      </g>
      {showLabel && Number.isFinite(labelX) && Number.isFinite(labelY) && (
        <EdgeLabelRenderer>
          <div
            className="collab-edge-label nopan nodrag nowheel nokey absolute rounded-full border border-[var(--collab-border)] bg-[var(--collab-elevated)] px-2 py-0.5 text-xs text-[var(--collab-text)]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              maxWidth: editing ? undefined : 240,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onLabelClick}
            onDoubleClickCapture={openEditor}
            onWheel={(event) => event.stopPropagation()}
          >
            {editing ? (
              <EdgeLabelEditor id={id} initialLabel={label} onClose={closeEditor} />
            ) : (
              <span className="block max-h-[72px] overflow-hidden whitespace-pre-wrap break-words">{label}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(LinkEdge);
