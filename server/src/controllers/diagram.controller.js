import Diagram from "../models/diagram.model.js";
import User from "../models/user.model.js";
import { deleteDiagramAndContent } from "../lib/diagramCleanup.js";
import {
  MAX_OWNED_DIAGRAMS,
  can,
  fitsStorage,
  parseBaseRevision,
  parseDiagramBody,
  parseDiagramId,
  roleOf,
  shapeDiagram,
  shapeListItem,
  storageAfterWrite,
} from "../lib/diagramAccess.js";

const OWNER_FIELDS = "_id fullName username email";
const NOT_FOUND = "Diagram not found";

function hexId(value) {
  if (value && typeof value.toHexString === "function") return value.toHexString();
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && value._id !== undefined) return hexId(value._id);
  return "";
}

function notFound(res) {
  return res.status(404).json({ message: NOT_FOUND });
}

async function loadDiagram(req) {
  const diagramId = parseDiagramId(req.params.diagramId);
  if (!diagramId) return { error: { status: 404, message: NOT_FOUND } };

  const me = req.user._id;
  const diagram = await Diagram.findOne({
    diagramId,
    $or: [{ owner: me }, { "members.user": me }],
  }).lean();
  if (!diagram) return { error: { status: 404, message: NOT_FOUND } };

  const role = roleOf(diagram, me);
  if (!role) return { error: { status: 404, message: NOT_FOUND } };
  return { diagram, role };
}

async function readOwners(ownerIds) {
  if (ownerIds.length === 0) return new Map();
  const rows = await User.find({ _id: { $in: ownerIds } }).select(OWNER_FIELDS).lean();
  return new Map(rows.map((user) => [hexId(user._id), user]));
}

async function ownedBytes(ownerId) {
  const rows = await Diagram.find({ owner: ownerId }).select("sizeBytes").lean();
  let usedBytes = 0;
  for (const row of rows) usedBytes += row.sizeBytes;
  return usedBytes;
}

export async function listDiagrams(req, res) {
  const me = req.user._id;
  const diagrams = await Diagram.find({
    $or: [{ owner: me }, { "members.user": me }],
  })
    .select("-content")
    .sort({ updatedAt: -1 })
    .lean();

  const ownerIds = [];
  const seen = new Set();
  for (const diagram of diagrams) {
    const id = hexId(diagram.owner);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ownerIds.push(diagram.owner);
  }
  const owners = await readOwners(ownerIds);

  res.status(200).json({
    userId: hexId(me),
    diagrams: diagrams.map((diagram) => shapeListItem(
      diagram,
      roleOf(diagram, me),
      owners.get(hexId(diagram.owner)) ?? null,
    )),
  });
}

export async function createDiagram(req, res) {
  const diagramId = parseDiagramId(req.body?.diagramId);
  if (!diagramId) return res.status(400).json({ message: "Invalid diagram id" });

  const parsed = parseDiagramBody(req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ message: parsed.message });

  const me = req.user._id;
  const ownedCount = await Diagram.countDocuments({ owner: me });
  if (ownedCount >= MAX_OWNED_DIAGRAMS) {
    return res.status(400).json({ message: `You can keep up to ${MAX_OWNED_DIAGRAMS} cloud diagrams` });
  }

  const usedBytes = await ownedBytes(me);
  const nextBytes = storageAfterWrite({
    usedBytes,
    oldBytes: 0,
    newBytes: parsed.value.sizeBytes,
  });
  if (!fitsStorage(nextBytes)) {
    return res.status(413).json({ message: "Storage limit reached" });
  }

  try {
    const created = await Diagram.create({
      diagramId,
      owner: me,
      name: parsed.value.name,
      database: parsed.value.database,
      content: parsed.value.content,
      sizeBytes: parsed.value.sizeBytes,
      revision: 1,
      members: [],
    });
    return res.status(201).json({
      diagramId,
      revision: 1,
      lastModified: new Date(created.updatedAt).toISOString(),
      sizeBytes: parsed.value.sizeBytes,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "A diagram with this id already exists" });
    }
    throw error;
  }
}

export async function getDiagram(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });

  const owners = await readOwners([loaded.diagram.owner]);
  res.status(200).json(shapeDiagram(
    loaded.diagram,
    loaded.role,
    owners.get(hexId(loaded.diagram.owner)) ?? null,
  ));
}

export async function updateDiagram(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
  if (!can(loaded.role, "edit")) {
    return res.status(403).json({ message: "You can only view this diagram" });
  }

  const baseRevision = parseBaseRevision(req.body?.baseRevision);
  if (baseRevision === null) {
    return res.status(400).json({ message: "baseRevision must be a positive whole number" });
  }

  const parsed = parseDiagramBody(req.body);
  if (!parsed.ok) return res.status(parsed.status).json({ message: parsed.message });

  const { diagram } = loaded;
  const usedBytes = await ownedBytes(diagram.owner);
  const nextBytes = storageAfterWrite({
    usedBytes,
    oldBytes: diagram.sizeBytes,
    newBytes: parsed.value.sizeBytes,
  });
  if (!fitsStorage(nextBytes)) {
    return res.status(413).json({ message: "Storage limit reached" });
  }

  const result = await Diagram.updateOne(
    { _id: diagram._id, revision: baseRevision },
    {
      $set: {
        name: parsed.value.name,
        database: parsed.value.database,
        content: parsed.value.content,
        sizeBytes: parsed.value.sizeBytes,
      },
      $inc: { revision: 1 },
    },
  );
  if (result.matchedCount === 0) {
    const current = await Diagram.findOne({ _id: diagram._id }).lean();
    if (!current) return notFound(res);
    return res.status(409).json({
      message: "This diagram was changed somewhere else",
      revision: current.revision,
    });
  }

  return res.status(200).json({
    diagramId: diagram.diagramId,
    revision: baseRevision + 1,
    lastModified: new Date().toISOString(),
    sizeBytes: parsed.value.sizeBytes,
  });
}

export async function deleteDiagram(req, res) {
  const loaded = await loadDiagram(req);
  if (loaded.error) return res.status(loaded.error.status).json({ message: loaded.error.message });
  if (!can(loaded.role, "delete")) {
    return res.status(403).json({ message: "Only the owner can delete this diagram" });
  }

  await deleteDiagramAndContent(loaded.diagram);
  return res.status(204).end();
}
