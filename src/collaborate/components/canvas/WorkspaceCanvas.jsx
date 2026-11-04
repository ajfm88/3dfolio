import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { selectCanEdit, useWorkspaceStore } from "../../store/useWorkspaceStore";
import CanvasControls from "./CanvasControls";

// React Flow re-creates every node when these objects change identity, so they
// live at module scope. ShapeNode (S09) and LinkEdge (S12) are registered here.
// Until then React Flow uses its fallback types and logs a missing-type warning
// for nodes. That's expected in S07–S08.
const nodeTypes = {};
const edgeTypes = {};

const Flow = () => {
  const rfNodes = useWorkspaceStore((s) => s.rfNodes);
  const rfEdges = useWorkspaceStore((s) => s.rfEdges);
  const onNodesChange = useWorkspaceStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkspaceStore((s) => s.onEdgesChange);
  const canEdit = useWorkspaceStore(selectCanEdit);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode="dark"
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={canEdit}
      nodesConnectable={canEdit}
      deleteKeyCode={canEdit ? "Backspace" : null}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <CanvasControls />
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
