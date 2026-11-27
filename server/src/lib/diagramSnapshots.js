import { createHash, randomBytes } from "node:crypto";
import { MAX_DIAGRAM_BYTES } from "./diagramAccess.js";

// Pure snapshot parsing and response shapes. No model, no I/O, no clock.

export const VERSION_FILENAME = "versionned.json";
export const SHARE_FILENAME = "share.json";
export const MAX_VERSIONS_PER_DIAGRAM = 20;
export const DEFAULT_VERSION_LIMIT = 10;
export const MAX_VERSION_LIMIT = 20;

const VERSION_ID_PATTERN = /^[0-9a-f]{40}$/;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function fail(status, message) {
  return { ok: false, status, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function iso(value) {
  return new Date(value).toISOString();
}

export function parseSnapshotContent(value) {
  if (typeof value !== "string") return fail(400, "Snapshot content must be text");

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail(400, "Snapshot content must be a JSON object");
  }
  if (!isPlainObject(parsed)) return fail(400, "Snapshot content must be a JSON object");
  if (!Object.hasOwn(parsed, "tables") || !Array.isArray(parsed.tables)) {
    return fail(400, "Snapshot content must have a tables list");
  }

  const content = JSON.stringify(parsed);
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes > MAX_DIAGRAM_BYTES) return fail(413, "Diagram is too large");

  const contentHash = createHash("sha256").update(content).digest("hex");
  return { ok: true, value: { content, sizeBytes, contentHash } };
}

export function parseVersionId(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) return null;
  return value;
}

export function parseShareId(value) {
  if (typeof value !== "string" || !SHARE_ID_PATTERN.test(value)) return null;
  return value;
}

export function parseVersionLimit(value) {
  if (value === undefined) return DEFAULT_VERSION_LIMIT;
  if (typeof value !== "string" || !/^\d{1,2}$/.test(value)) return null;
  const limit = Number(value);
  if (limit < 1 || limit > MAX_VERSION_LIMIT) return null;
  return limit;
}

export function parseVersionCursor(value) {
  if (value === undefined || value === "") return { ok: true, value: null };
  const id = parseVersionId(value);
  if (!id) return { ok: false };
  return { ok: true, value: id };
}

export function newVersionId() {
  return randomBytes(20).toString("hex");
}

export function newShareId() {
  return randomBytes(16).toString("base64url");
}

export function pageVersions(rows, { limit, cursor }) {
  let start = 0;
  if (cursor !== null) {
    const index = rows.findIndex((row) => row.versionId === cursor);
    if (index === -1) return { items: [], cursor: null, hasMore: false };
    start = index + 1;
  }
  const items = rows.slice(start, start + limit);
  const hasMore = start + limit < rows.length;
  return {
    items,
    cursor: hasMore ? items.at(-1).versionId : null,
    hasMore,
  };
}

export function versionsToPrune(rows, keep = MAX_VERSIONS_PER_DIAGRAM) {
  return rows.slice(keep).map((row) => row._id);
}

export function shapeVersionItem(row) {
  return {
    version: row.versionId,
    committed_at: iso(row.createdAt),
    sizeBytes: row.sizeBytes,
  };
}

export function shapeVersionFile(row) {
  return {
    id: row.versionId,
    committed_at: iso(row.createdAt),
    files: {
      [VERSION_FILENAME]: {
        filename: VERSION_FILENAME,
        size: row.sizeBytes,
        content: row.content,
      },
    },
  };
}

export function shapeShareFile(row) {
  return {
    id: row.shareId,
    updated_at: iso(row.updatedAt),
    files: {
      [SHARE_FILENAME]: {
        filename: SHARE_FILENAME,
        size: row.sizeBytes,
        content: row.content,
      },
    },
  };
}
