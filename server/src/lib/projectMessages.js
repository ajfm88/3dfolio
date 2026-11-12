import mongoose from "mongoose";

export const PROJECT_MESSAGE_TEXT_MAX = 2000;
export const PROJECT_MESSAGE_PAGE_LIMIT = 50;
export const COLLABORATE_MEDIA_FOLDER = "/collaborate";

export const HISTORY_LIMIT_MESSAGE = "Limit must be a whole number from 1 to 50";
export const HISTORY_BEFORE_MESSAGE = "before must be a UTC timestamp";
export const HISTORY_BEFORE_ID_MESSAGE = "beforeId must be a message id";
export const HISTORY_BEFORE_ID_REQUIRES_BEFORE = "beforeId requires before";
export const TEXT_TYPE_MESSAGE = "Message text must be text";
export const TEXT_LENGTH_MESSAGE = "Message text must be at most 2000 characters";
export const TEXT_OR_MEDIA_MESSAGE = "A message needs text or one attachment";
export const PROJECT_NOT_FOUND_MESSAGE = "Project not found";
export const CHAT_FORBIDDEN_MESSAGE = "You cannot chat in this project";
export const MEDIA_NOT_CONFIGURED_MESSAGE = "Media upload is not configured";

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const WHOLE_NUMBER = /^[1-9]\d*$/;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function canonicalObjectId(value) {
  if (typeof value === "string" && OBJECT_ID.test(value)) return value.toLowerCase();
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value && typeof value.toHexString === "function") {
    try {
      const hex = value.toHexString();
      return OBJECT_ID.test(hex) ? hex : null;
    } catch {
      return null;
    }
  }
  if (isPlainObject(value) && Object.hasOwn(value, "_id")) return canonicalObjectId(value._id);
  return null;
}

function isoTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date.toISOString() === value) return value;
  }
  return "";
}

function fail(message) {
  return { ok: false, message };
}

// limit, before, and beforeId are read only. An array or object is a repeated
// or nested query, which Express will not flatten into one string for us.
export function parseHistoryQuery(query) {
  const source = isPlainObject(query) ? query : {};

  let limit = PROJECT_MESSAGE_PAGE_LIMIT;
  if (Object.hasOwn(source, "limit") && source.limit !== undefined) {
    if (typeof source.limit !== "string" || !WHOLE_NUMBER.test(source.limit)) {
      return fail(HISTORY_LIMIT_MESSAGE);
    }
    limit = Number(source.limit);
    if (limit < 1 || limit > PROJECT_MESSAGE_PAGE_LIMIT) return fail(HISTORY_LIMIT_MESSAGE);
  }

  let before = null;
  if (Object.hasOwn(source, "before") && source.before !== undefined) {
    // Invalid dates become "". An empty query value is that same string, so
    // equality alone would treat ?before= as an omitted cursor.
    if (
      typeof source.before !== "string"
      || source.before.length === 0
      || isoTimestamp(source.before) !== source.before
    ) {
      return fail(HISTORY_BEFORE_MESSAGE);
    }
    before = source.before;
  }

  let beforeId = null;
  if (Object.hasOwn(source, "beforeId") && source.beforeId !== undefined) {
    if (!before) return fail(HISTORY_BEFORE_ID_REQUIRES_BEFORE);
    if (typeof source.beforeId !== "string") return fail(HISTORY_BEFORE_ID_MESSAGE);
    beforeId = canonicalObjectId(source.beforeId);
    if (!beforeId) return fail(HISTORY_BEFORE_ID_MESSAGE);
  }

  return { ok: true, limit, before, beforeId };
}

// The project id is the authorized route id. beforeId is a cursor value, not
// a lookup, so this filter cannot see another project's rows.
export function historyFilter(projectId, parsed) {
  const filter = { project: projectId };
  if (!parsed?.before) return filter;

  const at = new Date(parsed.before);
  if (parsed.beforeId) {
    filter.$or = [
      { createdAt: { $lt: at } },
      { createdAt: at, _id: { $lt: parsed.beforeId } },
    ];
    return filter;
  }

  filter.createdAt = { $lt: at };
  return filter;
}

export function parseMessageText(body) {
  const source = isPlainObject(body) ? body : {};
  if (!Object.hasOwn(source, "text") || source.text === undefined) {
    return { ok: true, text: "" };
  }
  if (typeof source.text !== "string") return fail(TEXT_TYPE_MESSAGE);
  if (source.text.length > PROJECT_MESSAGE_TEXT_MAX) return fail(TEXT_LENGTH_MESSAGE);
  return { ok: true, text: source.text.trim() };
}

export function messageHasContent(text, file) {
  return (typeof text === "string" && text.trim().length > 0) || Boolean(file);
}

function shapeSender(sender) {
  if (!isPlainObject(sender) || !Object.hasOwn(sender, "_id") || sender._id === null || sender._id === undefined) {
    return null;
  }
  const id = canonicalObjectId(sender._id);
  if (!id) return null;
  return {
    _id: id,
    fullName: typeof sender.fullName === "string" ? sender.fullName : "",
    img: typeof sender.img === "string" ? sender.img : "",
  };
}

// A new object every time, so email, Clerk ids, and __v on the stored doc
// cannot ride along into REST or the socket event.
export function toMessageResource(doc) {
  const source = isPlainObject(doc) ? doc : {};
  return {
    _id: canonicalObjectId(source._id) ?? "",
    project: canonicalObjectId(source.project) ?? "",
    sender: shapeSender(source.sender),
    text: typeof source.text === "string" ? source.text : "",
    image: typeof source.image === "string" ? source.image : "",
    video: typeof source.video === "string" ? source.video : "",
    createdAt: isoTimestamp(source.createdAt),
    updatedAt: isoTimestamp(source.updatedAt),
  };
}

// rows are newest-first and may include the extra probe row. The input array
// is not reversed in place; the page the client sees is oldest-first.
export function pageHistory(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  const hasMore = list.length > limit;
  const oldestFirst = list.slice(0, limit).reverse();
  const oldest = oldestFirst[0];
  const nextCursor = hasMore && oldest
    ? { before: isoTimestamp(oldest.createdAt), beforeId: canonicalObjectId(oldest._id) ?? "" }
    : null;
  return {
    messages: oldestFirst.map((row) => toMessageResource(row)),
    hasMore,
    nextCursor,
  };
}
