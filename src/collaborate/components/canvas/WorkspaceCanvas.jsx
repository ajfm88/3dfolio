import { useCallback, useMemo, useRef } from "react";
import { Background, BackgroundVariant, ConnectionLineType, ConnectionMode, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { selectCanEdit, useWorkspaceStore } from "../../store/useWorkspaceStore";
import CanvasControls from "./CanvasControls";
import LinkEdge from "./LinkEdge";
import ShapePanel from "./ShapePanel";
import ShapeNode from "./ShapeNode";
import { PresenceCursors } from "./PresenceCursors";
import { createCursorPointerHandlers } from "../../lib/cursorPresence";
import { createShapeNode, SHAPE_DRAG_TYPE } from "../../lib/shapeDrag";
import { shouldFocusCanvas, useCanvasShortcuts, useGestureCancel } from "../../lib/canvasShortcuts";

const nodeTypes = { shape: ShapeNode };
const edgeTypes = { link: LinkEdge };
const connectionLineStyle = { stroke: "var(--collab-edge)", strokeWidth: 1.5 };

const Flow = () => {
  const rfNodes = useWorkspaceStore((s) => s.rfNodes);
  const rfEdges = useWorkspaceStore((s) => s.rfEdges);
  const onNodesChange = useWorkspaceStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkspaceStore((s) => s.onEdgesChange);
  const canEdit = useWorkspaceStore(selectCanEdit);
  const { screenToFlowPosition, zoomIn, zoomOut } = useReactFlow();
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const commitNodePositions = useWorkspaceStore((s) => s.commitNodePositions);
  const deleteElements = useWorkspaceStore((s) => s.deleteElements);
  const connectNodes = useWorkspaceStore((s) => s.connectNodes);
  const onNodeDrag = useWorkspaceStore((s) => s.onNodeDrag);
  const moveCursor = useWorkspaceStore((s) => s.moveCursor);
  const leaveCursor = useWorkspaceStore((s) => s.leaveCursor);
  const beginGesture = useWorkspaceStore((s) => s.beginGesture);
  const endGesture = useWorkspaceStore((s) => s.endGesture);
  const cancelGestures = useWorkspaceStore((s) => s.cancelGestures);
  const gestureActive = useWorkspaceStore((s) => Boolean(s.history?.gesture));
  useGestureCancel(gestureActive, cancelGestures);

  const wrapperRef = useRef(null);

  // A gesture ends before its final commit is dispatched, so the commit's own
  // queue state, not a stale gesture flag, decides when undo is available.
  const onConnect = useCallback((connection) => {
    endGesture("connect");
    connectNodes(connection);
  }, [connectNodes, endGesture]);

  const onConnectStart = useCallback(() => beginGesture("connect"), [beginGesture]);
  const onConnectEnd = useCallback(() => endGesture("connect"), [endGesture]);
  const onNodeDragStart = useCallback(() => beginGesture("drag"), [beginGesture]);

  const onNodeDragStop = useCallback((_event, _node, nodes) => {
    endGesture("drag");
    commitNodePositions(nodes);
  }, [commitNodePositions, endGesture]);

  const onDelete = useCallback((elements) => {
    deleteElements(elements);
  }, [deleteElements]);

  const onDragOver = useCallback((event) => {
    if (!canEdit || !event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, [canEdit]);

  const onDrop = useCallback((event) => {
    if (!canEdit || !event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) return;
    event.preventDefault();
    const shape = event.dataTransfer.getData(SHAPE_DRAG_TYPE);
    const center = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const node = createShapeNode(shape, center);
    if (node) dispatch([{ type: "node.add", node }]);
  }, [canEdit, screenToFlowPosition, dispatch]);

  const pointer = useMemo(() => createCursorPointerHandlers({
    screenToFlowPosition,
    moveCursor,
    leaveCursor,
    getWrapper: () => wrapperRef.current,
  }), [screenToFlowPosition, moveCursor, leaveCursor]);

  // Zoom stays on the canvas for every role. The handler is attached to the
  // surface element itself, so keys typed in a portaled editor never reach it.
  const actionsRef = useRef(null);
  actionsRef.current = {
    undo: () => useWorkspaceStore.getState().undo(),
    redo: () => useWorkspaceStore.getState().redo(),
    zoomIn: () => { zoomIn({ duration: 200 }); return true; },
    zoomOut: () => { zoomOut({ duration: 200 }); return true; },
  };
  useCanvasShortcuts(wrapperRef, actionsRef);

  const onPointerDown = useCallback((event) => {
    const surface = wrapperRef.current;
    if (surface && shouldFocusCanvas(event, surface.ownerDocument)) surface.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      role="application"
      aria-label="Diagram canvas"
      className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--collab-accent)]"
      onPointerDown={onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerLeave={pointer.onPointerLeave}
      onPointerCancel={pointer.onPointerCancel}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeDrag={onNodeDrag}
        onDelete={onDelete}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={connectionLineStyle}
        colorMode="dark"
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <CanvasControls />
        {canEdit && <ShapePanel />}
        <PresenceCursors />
      </ReactFlow>
    </div>
  );
};

const WorkspaceCanvas = () => (
  <ReactFlowProvider>
    <Flow />
  </ReactFlowProvider>
);

export default WorkspaceCanvas;