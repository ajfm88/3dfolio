import mongoose from "mongoose";

// Pure helpers for diagram roles and save payloads. No model, no I/O, no clock.

export const DIAGRAM_MEMBER_ROLES = ["editor", "viewer"];
export const MAX_DIAGRAM_BYTES = 1_048_576;          // 1 MiB of content
export const MAX_OWNED_DIAGRAMS = 50;
export const MAX_STORAGE_BYTES = 25 * 1_048_576;     // 25 MiB per owner
export const DIAGRAM_NAME_MAX = 200;
export const DEFAULT_DIAGRAM_NAME = "Untitled diagram";
export const DEFAULT_DATABASE = "generic";

const DATABASE_PATTERN = /^[a-z0-9_]{1,32}$/;
const DIAGRAM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_FIELDS = ["tables", "references", "notes", "areas", "views", "enums", "types"];
const REQUIRED_LISTS = new Set(["tables", "references"]);

const PERMISSIONS = Object.freeze({
  owner: Object.freeze({
    view: true,
    edit: true,
    version: true,
    share: true,
    manage: true,
    delete: true,
    leave: false,
  }),
  editor: Object.freeze({
    view: true,
    edit: true,
    version: true,
    share: true,
    manage: false,
    delete: false,
    leave: true,
  }),
  viewer: Object.freeze({
    view: true,
    edit: false,
    version: false,
    share: false,
    manage: false,
    delete: false,
    leave: true,
  }),
});

function fail(status, message) {
  return { ok: false, status, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function idString(value) {
  try {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value === "" ? null : value.toLowerCase();
    if (typeof value !== "object") return null;
    if (value instanceof mongoose.Types.ObjectId || typeof value.toHexString === "function") {
      const hex = value.toHexString();
      return typeof hex === "string" && hex !== "" ? hex.toLowerCase() : null;
    }
    if (!Array.isArray(value) && value._id !== undefined && value._id !== value) {
      return idString(value._id);
    }
    return null;
  } catch {
    return null;
  }
}

export function roleOf(diagram, userId) {
  try {
    if (diagram === null || typeof diagram !== "object" || Array.isArray(diagram)) return null;
    const id = idString(userId);
    if (id === null) return null;
    if (idString(diagram.owner) === id) return "owner";
    if (!Array.isArray(diagram.members)) return null;
    for (const member of diagram.members) {
      if (idString(member?.user) === id) {
        return DIAGRAM_MEMBER_ROLES.includes(member.role) ? member.role : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function can(role, action) {
  return Object.hasOwn(PERMISSIONS, role)
    && Object.hasOwn(PERMISSIONS[role], action)
    && PERMISSIONS[role][action] === true;
}

export function parseDiagramId(value) {
  if (typeof value !== "string" || !DIAGRAM_ID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

export function parseBaseRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) return null;
  return value;
}

function readName(body) {
  if (!Object.hasOwn(body, "name") || body.name === null || body.name === undefined) {
    return { ok: true, value: DEFAULT_DIAGRAM_NAME };
  }
  if (typeof body.name !== "string") return fail(400, "Name must be text");
  const name = body.name.trim();
  if (name.length === 0) return { ok: true, value: DEFAULT_DIAGRAM_NAME };
  if (name.length > DIAGRAM_NAME_MAX) {
    return fail(400, `Name must be ${DIAGRAM_NAME_MAX} characters or fewer`);
  }
  return { ok: true, value: name };
}

function readDatabase(body) {
  if (!Object.hasOwn(body, "database") || body.database === null || body.database === undefined) {
    return { ok: true, value: DEFAULT_DATABASE };
  }
  if (typeof body.database !== "string" || !DATABASE_PATTERN.test(body.database)) {
    return fail(400, "Unknown database type");
  }
  return { ok: true, value: body.database };
}

function readList(body, field) {
  const missing = !Object.hasOwn(body, field) || body[field] === undefined;
  if (missing || body[field] === null) {
    if (REQUIRED_LISTS.has(field)) return fail(400, `${field} must be a list`);
    return { ok: true, value: [] };
  }
  if (!Array.isArray(body[field])) return fail(400, `${field} must be a list`);
  for (const element of body[field]) {
    if (!isPlainObject(element)) return fail(400, `${field} must contain objects`);
  }
  return { ok: true, value: body[field] };
}

function readSqlHeader(body) {
  if (!Object.hasOwn(body, "sqlHeader") || body.sqlHeader === null || body.sqlHeader === undefined) {
    return { ok: true, value: "" };
  }
  if (typeof body.sqlHeader !== "string") return fail(400, "sqlHeader must be text");
  return { ok: true, value: body.sqlHeader };
}

function readPan(body) {
  if (!Object.hasOwn(body, "pan") || body.pan === null || body.pan === undefined) {
    return { ok: true, value: { x: 0, y: 0 } };
  }
  if (!isPlainObject(body.pan) || !Number.isFinite(body.pan.x) || !Number.isFinite(body.pan.y)) {
    return fail(400, "pan must have numeric x and y");
  }
  return { ok: true, value: { x: body.pan.x, y: body.pan.y } };
}

function readZoom(body) {
  if (!Object.hasOwn(body, "zoom") || body.zoom === null || body.zoom === undefined) {
    return { ok: true, value: 1 };
  }
  if (typeof body.zoom !== "number" || !Number.isFinite(body.zoom) || body.zoom <= 0) {
    return fail(400, "zoom must be a positive number");
  }
  return { ok: true, value: body.zoom };
}

export function parseDiagramBody(body) {
  if (!isPlainObject(body)) return fail(400, "Diagram data must be an object");

  const name = readName(body);
  if (!name.ok) return name;
  const database = readDatabase(body);
  if (!database.ok) return database;

  const lists = {};
  for (const field of LIST_FIELDS) {
    const parsed = readList(body, field);
    if (!parsed.ok) return parsed;
    lists[field] = parsed.value;
  }

  const sqlHeader = readSqlHeader(body);
  if (!sqlHeader.ok) return sqlHeader;
  const pan = readPan(body);
  if (!pan.ok) return pan;
  const zoom = readZoom(body);
  if (!zoom.ok) return zoom;

  const content = JSON.stringify({
    tables: lists.tables,
    references: lists.references,
    notes: lists.notes,
    areas: lists.areas,
    views: lists.views,
    enums: lists.enums,
    types: lists.types,
    sqlHeader: sqlHeader.value,
    pan: pan.value,
    zoom: zoom.value,
  });
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes > MAX_DIAGRAM_BYTES) return fail(413, "Diagram is too large");

  return {
    ok: true,
    value: {
      name: name.value,
      database: database.value,
      content,
      sizeBytes,
    },
  };
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function shapeOwner(user) {
  if (!user || typeof user !== "object") return null;
  const id = idString(user._id);
  if (id === null) return null;
  return {
    id,
    username: user.fullName || user.username || "",
    email: user.email || "",
  };
}

export function shapeListItem(diagram, role, owner) {
  return {
    diagramId: diagram.diagramId,
    name: diagram.name,
    database: diagram.database,
    lastModified: toIso(diagram.updatedAt),
    sizeBytes: diagram.sizeBytes,
    role,
    owner: shapeOwner(owner),
  };
}

export function shapeDiagram(diagram, role, owner) {
  const content = JSON.parse(diagram.content);
  if (!isPlainObject(content)) throw new Error("Diagram content is invalid");
  return {
    diagramId: diagram.diagramId,
    name: diagram.name,
    database: diagram.database,
    lastModified: toIso(diagram.updatedAt),
    revision: diagram.revision,
    sizeBytes: diagram.sizeBytes,
    role,
    canWrite: can(role, "edit"),
    owner: shapeOwner(owner),
    ...content,
  };
}

export function storageAfterWrite({ usedBytes, oldBytes, newBytes }) {
  return usedBytes - oldBytes + newBytes;
}

export function fitsStorage(bytes) {
  return bytes <= MAX_STORAGE_BYTES;
}
