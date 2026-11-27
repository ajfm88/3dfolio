import Diagram from "../models/diagram.model.js";
import DiagramShare from "../models/diagramShare.model.js";
import DiagramVersion from "../models/diagramVersion.model.js";
import { parseDiagramId, roleOf } from "./diagramAccess.js";

export const DIAGRAM_NOT_FOUND = "Diagram not found";

export async function loadDiagram(req) {
  const diagramId = parseDiagramId(req.params.diagramId);
  if (!diagramId) return { error: { status: 404, message: DIAGRAM_NOT_FOUND } };

  const me = req.user._id;
  const diagram = await Diagram.findOne({
    diagramId,
    $or: [{ owner: me }, { "members.user": me }],
  }).lean();
  if (!diagram) return { error: { status: 404, message: DIAGRAM_NOT_FOUND } };

  const role = roleOf(diagram, me);
  if (!role) return { error: { status: 404, message: DIAGRAM_NOT_FOUND } };
  return { diagram, role };
}

export async function ownedBytes(ownerId) {
  const rows = await Diagram.find({ owner: ownerId }).select("sizeBytes").lean();
  let usedBytes = 0;
  for (const row of rows) usedBytes += row.sizeBytes;
  const versions = await DiagramVersion.find({ owner: ownerId }).select("sizeBytes").lean();
  for (const row of versions) usedBytes += row.sizeBytes;
  const shares = await DiagramShare.find({ owner: ownerId }).select("sizeBytes").lean();
  for (const row of shares) usedBytes += row.sizeBytes;
  return usedBytes;
}
