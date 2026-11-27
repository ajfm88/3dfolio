import DiagramVersion from "../models/diagramVersion.model.js";
import { can, fitsStorage, storageAfterWrite } from "../lib/diagramAccess.js";
import {
  newVersionId,
  pageVersions,
  parseSnapshotContent,
  parseVersionCursor,
  parseVersionId,
  parseVersionLimit,
  shapeVersionFile,
  shapeVersionItem,
  versionsToPrune,
} from "../lib/diagramSnapshots.js";
import { loadDiagram, ownedBytes } from "../lib/diagramStore.js";

const VIEW_ONLY = "You can only view this diagram";
const VERSION_NOT_FOUND = "Version not found";

function sendError(res, error) {
  return res.status(error.status).json({ message: error.message });
}

function readVersionMeta(diagram) {
  return DiagramVersion.find({ diagram: diagram._id })
    .select("-content")
    .sort({ createdAt: -1, _id: -1 })
    .lean();
}

export async function listVersions(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return sendError(res, loaded.error);

  const limit = parseVersionLimit(req.query.limit);
  if (limit === null) return res.status(400).json({ message: "Invalid limit" });
  const cursor = parseVersionCursor(req.query.cursor);
  if (!cursor.ok) return res.status(400).json({ message: "Invalid cursor" });

  const rows = await readVersionMeta(loaded.diagram);
  const page = pageVersions(rows, { limit, cursor: cursor.value });
  return res.status(200).json({
    data: page.items.map(shapeVersionItem),
    pagination: {
      cursor: page.cursor,
      hasMore: page.hasMore,
      limit,
      count: page.items.length,
    },
  });
}

export async function recordVersion(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return sendError(res, loaded.error);
  if (!can(loaded.role, "version")) {
    return res.status(403).json({ message: VIEW_ONLY });
  }

  const parsed = parseSnapshotContent(req.body?.content);
  if (!parsed.ok) return res.status(parsed.status).json({ message: parsed.message });

  const { diagram } = loaded;
  const existing = await readVersionMeta(diagram);
  const newest = existing[0];
  if (newest && newest.contentHash === parsed.value.contentHash) {
    return res.status(200).json({
      recorded: false,
      version: shapeVersionItem(newest),
    });
  }

  const usedBytes = await ownedBytes(diagram.owner);
  const nextBytes = storageAfterWrite({
    usedBytes,
    oldBytes: 0,
    newBytes: parsed.value.sizeBytes,
  });
  if (!fitsStorage(nextBytes)) {
    return res.status(413).json({ message: "Storage limit reached" });
  }

  const created = await DiagramVersion.create({
    versionId: newVersionId(),
    diagram: diagram._id,
    owner: diagram.owner,
    recordedBy: req.user._id,
    content: parsed.value.content,
    contentHash: parsed.value.contentHash,
    sizeBytes: parsed.value.sizeBytes,
  });

  const rows = await readVersionMeta(diagram);
  const ids = versionsToPrune(rows);
  if (ids.length > 0) {
    await DiagramVersion.deleteMany({ diagram: diagram._id, _id: { $in: ids } });
  }

  return res.status(201).json({
    recorded: true,
    version: shapeVersionItem(created),
  });
}

export async function getVersion(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return sendError(res, loaded.error);

  const versionId = parseVersionId(req.params.versionId);
  if (!versionId) return res.status(404).json({ message: VERSION_NOT_FOUND });

  const row = await DiagramVersion.findOne({ diagram: loaded.diagram._id, versionId }).lean();
  if (!row) return res.status(404).json({ message: VERSION_NOT_FOUND });
  return res.status(200).json({ data: shapeVersionFile(row) });
}

export async function compareVersions(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return sendError(res, loaded.error);

  const versionA = parseVersionId(req.params.versionA);
  const versionBParam = req.params.versionB;
  const versionB = versionBParam === "null" ? null : parseVersionId(versionBParam);
  if (!versionA || (versionBParam !== "null" && !versionB)) {
    return res.status(404).json({ message: VERSION_NOT_FOUND });
  }

  const a = await DiagramVersion.findOne({
    diagram: loaded.diagram._id,
    versionId: versionA,
  }).lean();
  if (!a) return res.status(404).json({ message: VERSION_NOT_FOUND });

  let contentB = "";
  if (versionB) {
    const b = await DiagramVersion.findOne({
      diagram: loaded.diagram._id,
      versionId: versionB,
    }).lean();
    if (!b) return res.status(404).json({ message: VERSION_NOT_FOUND });
    contentB = b.content;
  }

  return res.status(200).json({ data: { contentA: a.content, contentB } });
}
