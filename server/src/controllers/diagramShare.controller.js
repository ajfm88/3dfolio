import DiagramShare from "../models/diagramShare.model.js";
import { can, fitsStorage, storageAfterWrite } from "../lib/diagramAccess.js";
import { newShareId, parseShareId, parseSnapshotContent, shapeShareFile } from "../lib/diagramSnapshots.js";
import { loadDiagram, ownedBytes } from "../lib/diagramStore.js";

const VIEW_ONLY = "You can only view this diagram";
const SHARE_NOT_FOUND = "Share not found";

async function refreshShare(existing, content, sizeBytes, userId) {
  const result = await DiagramShare.updateOne(
    { _id: existing._id },
    { $set: { content, sizeBytes, updatedBy: userId } },
  );
  if (!result.matchedCount) return null;
  return {
    shareId: existing.shareId,
    created: false,
    sizeBytes,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveShare(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
  if (!can(loaded.role, "share")) {
    return res.status(403).json({ message: VIEW_ONLY });
  }

  const parsed = parseSnapshotContent(req.body?.content);
  if (!parsed.ok) return res.status(parsed.status).json({ message: parsed.message });

  const { diagram } = loaded;
  const { content, sizeBytes } = parsed.value;
  const existing = await DiagramShare.findOne({ diagram: diagram._id }).lean();
  const usedBytes = await ownedBytes(diagram.owner);
  const nextBytes = storageAfterWrite({
    usedBytes,
    oldBytes: existing?.sizeBytes ?? 0,
    newBytes: sizeBytes,
  });
  if (!fitsStorage(nextBytes)) {
    return res.status(413).json({ message: "Storage limit reached" });
  }

  if (existing) {
    const refreshed = await refreshShare(existing, content, sizeBytes, req.user._id);
    if (refreshed) return res.status(200).json(refreshed);
  }

  try {
    const created = await DiagramShare.create({
      shareId: newShareId(),
      diagram: diagram._id,
      owner: diagram.owner,
      updatedBy: req.user._id,
      content,
      sizeBytes,
    });
    return res.status(201).json({
      shareId: created.shareId,
      created: true,
      sizeBytes,
      updatedAt: new Date(created.updatedAt).toISOString(),
    });
  } catch (error) {
    if (!error || error.code !== 11000) throw error;
    const again = await DiagramShare.findOne({ diagram: diagram._id }).lean();
    if (!again) throw error;
    const refreshed = await refreshShare(again, content, sizeBytes, req.user._id);
    if (!refreshed) throw error;
    return res.status(200).json(refreshed);
  }
}

export async function deleteShare(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
  if (!can(loaded.role, "share")) {
    return res.status(403).json({ message: VIEW_ONLY });
  }

  await DiagramShare.deleteOne({ diagram: loaded.diagram._id });
  return res.status(204).end();
}

export async function getShare(req, res) {
  const shareId = parseShareId(req.params.shareId);
  if (!shareId) return res.status(404).json({ message: SHARE_NOT_FOUND });

  const row = await DiagramShare.findOne({ shareId }).lean();
  if (!row) return res.status(404).json({ message: SHARE_NOT_FOUND });

  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: shapeShareFile(row) });
}
