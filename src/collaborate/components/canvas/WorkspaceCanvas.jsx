import { useCallback } from "react";
import { Background, BackgroundVariant, ConnectionLineType, ConnectionMode, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { selectCanEdit, useWorkspaceStore } from "../../store/useWorkspaceStore";
import CanvasControls from "./CanvasControls";
import LinkEdge from "./LinkEdge";
import ShapePanel from "./ShapePanel";
import ShapeNode from "./ShapeNode";
import { createShapeNode, SHAPE_DRAG_TYPE } from "../../lib/shapeDrag";

// React Flow re-creates every node when these objects change identity, so they
// live at module scope.
const nodeTypes = { shape: ShapeNode };
const edgeTypes = { link: LinkEdge };
const connectionLineStyle = { stroke: "var(--collab-edge)", strokeWidth: 1.5 };

const Flow = () => {
  const rfNodes = useWorkspaceStore((s) => s.rfNodes);
  const rfEdges = useWorkspaceStore((s) => s.rfEdges);
  const onNodesChange = useWorkspaceStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkspaceStore((s) => s.onEdgesChange);
  const canEdit = useWorkspaceStore(selectCanEdit);
  const { screenToFlowPosition } = useReactFlow();
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const commitNodePositions = useWorkspaceStore((s) => s.commitNodePositions);
  const deleteElements = useWorkspaceStore((s) => s.deleteElements);
  const connectNodes = useWorkspaceStore((s) => s.connectNodes);
  const onNodeDrag = useWorkspaceStore((s) => s.onNodeDrag);

  const onConnect = useCallback((connection) => {
    connectNodes(connection);
  }, [connectNodes]);

  const onNodeDragStop = useCallback((_event, _node, nodes) => {
    commitNodePositions(nodes);
  }, [commitNodePositions]);

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

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onNodeDragStop={onNodeDragStop}
      onNodeDrag={onNodeDrag}
      onDelete={onDelete}
      onConnect={onConnect}
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
    </ReactFlow>
  );
};

// React Flow sizes itself to its parent. The main area's height comes from the
// flex column, so the canvas is pinned to that box instead of growing the page.
const WorkspaceCanvas = () => (
  <div className="absolute inset-0">
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  </div>
);

export default WorkspaceCanvas;
