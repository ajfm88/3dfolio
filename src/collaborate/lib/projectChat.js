// Pure project-chat rules. The store and the panel both use these so a test can
// decide ordering, cursors, and keyboard behavior without rendering or sockets.

export const PROJECT_CHAT_TEXT_MAX = 2000;
export const PROJECT_CHAT_PAGE_LIMIT = 50;
export const PROJECT_CHAT_MEDIA_BYTES = 25 * 1024 * 1024;
export const NEAR_BOTTOM_PX = 64;
export const SOUND_STORAGE_KEY = "ajfm88-collaborate";
export const PROJECT_CHAT_PANEL_ID = "project-chat-panel";
export const PROJECT_CHAT_TOGGLE_ID = "project-chat-toggle";

const OBJECT_ID = /^[0-9a-f]{24}$/;
const SAFE_MEDIA = /^https?:\/\//i;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function canonicalObjectId(value) {
  if (typeof value !== "string") return "";
  const id = value.toLowerCase();
  return OBJECT_ID.test(id) ? id : "";
}

export function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function isSafeMediaUrl(value) {
  return value === "" || (typeof value === "string" && SAFE_MEDIA.test(value));
}

export function compareMessages(a, b) {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  if (a._id < b._id) return -1;
  if (a._id > b._id) return 1;
  return 0;
}

function shapeSender(sender) {
  if (sender == null) return { ok: true, sender: null };
  if (!isRecord(sender)) return { ok: false };
  const id = canonicalObjectId(sender._id);
  if (!id) return { ok: false };
  if (typeof sender.fullName !== "string" || typeof sender.img !== "string") return { ok: false };
  return {
    ok: true,
    sender: {
      _id: id,
      fullName: sender.fullName,
      img: isSafeMediaUrl(sender.img) ? sender.img : "",
    },
  };
}

// A resource that fails any of these checks is dropped whole. Callers must not
// publish a partially filled message.
export function normalizeMessage(source, projectId) {
  if (!isRecord(source)) return null;
  const id = canonicalObjectId(source._id);
  const project = canonicalObjectId(source.project);
  const expected = canonicalObjectId(projectId);
  if (!id || !project || !expected || project !== expected) return null;
  if (typeof source.text !== "string" || source.text.length > PROJECT_CHAT_TEXT_MAX) return null;
  if (!isSafeMediaUrl(source.image) || !isSafeMediaUrl(source.video)) return null;
  if (!isCanonicalTimestamp(source.createdAt) || !isCanonicalTimestamp(source.updatedAt)) return null;
  const sender = shapeSender(source.sender);
  if (!sender.ok) return null;
  return {
    _id: id,
    project,
    sender: sender.sender,
    text: source.text,
    image: source.image,
    video: source.video,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function normalizeMessageEvent(payload, projectId) {
  if (!isRecord(payload)) return null;
  const eventProject = canonicalObjectId(payload.projectId);
  const expected = canonicalObjectId(projectId);
  if (!eventProject || eventProject !== expected) return null;
  const message = normalizeMessage(payload.message, expected);
  if (!message || message.project !== eventProject) return null;
  return message;
}

export function normalizeTypingEvent(payload, projectId) {
  if (!isRecord(payload)) return null;
  const eventProject = canonicalObjectId(payload.projectId);
  const expected = canonicalObjectId(projectId);
  if (!eventProject || eventProject !== expected) return null;
  if (typeof payload.isTyping !== "boolean") return null;
  const userId = canonicalObjectId(payload.userId);
  if (!userId) return null;
  return { projectId: eventProject, userId, isTyping: payload.isTyping };
}

function cursorFrom(source) {
  if (!isRecord(source)) return null;
  const before = source.before;
  const beforeId = canonicalObjectId(source.beforeId);
  if (!isCanonicalTimestamp(before) || !beforeId) return null;
  return { before, beforeId };
}

// hasMore requires the paired cursor of the oldest returned row. Anything else
// can stall Load earlier on the same page.
export function validateHistoryPage(body, projectId) {
  if (!isRecord(body) || !Array.isArray(body.messages) || typeof body.hasMore !== "boolean") {
    return { ok: false };
  }
  const messages = [];
  for (const raw of body.messages) {
    const message = normalizeMessage(raw, projectId);
    if (!message) return { ok: false };
    messages.push(message);
  }
  if (!body.hasMore) {
    if (body.nextCursor != null) return { ok: false };
    return { ok: true, messages, hasMore: false, nextCursor: null };
  }
  const nextCursor = cursorFrom(body.nextCursor);
  if (!nextCursor || messages.length === 0) return { ok: false };
  const oldest = [...messages].sort(compareMessages)[0];
  if (nextCursor.before !== oldest.createdAt || nextCursor.beforeId !== oldest._id) return { ok: false };
  return { ok: true, messages, hasMore: true, nextCursor };
}

export function cursorAdvances(previous, next) {
  if (!previous || !next) return false;
  if (next.before < previous.before) return true;
  if (next.before > previous.before) return false;
  return next.beforeId < previous.beforeId;
}

export function mergeMessages(current, incoming) {
  const map = new Map();
  for (const message of current) map.set(message._id, message);
  for (const message of incoming) map.set(message._id, message);
  return [...map.values()].sort(compareMessages);
}

export function messageHasContent(text, file) {
  return (typeof text === "string" && text.trim().length > 0) || Boolean(file);
}

export function validateAttachment(file) {
  if (!file) return { ok: true };
  const type = typeof file.type === "string" ? file.type : "";
  if (!type.startsWith("image/") && !type.startsWith("video/")) {
    return { ok: false, message: "Only image and video uploads are allowed" };
  }
  const size = file.size;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0 || size > PROJECT_CHAT_MEDIA_BYTES) {
    return { ok: false, message: "Attachment must be 25 MB or smaller" };
  }
  return { ok: true };
}

export function composerKeyDecision(event) {
  const composing = Boolean(event?.isComposing || event?.keyCode === 229);
  if (composing || event?.key !== "Enter") return { send: false, newline: false };
  if (event.shiftKey) return { send: false, newline: true };
  return { send: true, newline: false };
}

export function shouldCloseChatOnEscape(event, drawer) {
  if (!drawer || event?.key !== "Escape") return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}

export function unreadBadge(count) {
  if (!Number.isInteger(count) || count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

export function unreadLabel(count) {
  const badge = unreadBadge(count);
  if (!badge) return "Chat";
  const noun = count === 1 ? "unread message" : "unread messages";
  return `Chat, ${badge} ${noun}`;
}

export function typingLabel(names) {
  const list = Array.isArray(names)
    ? names.filter((name) => typeof name === "string" && name.trim())
    : [];
  if (list.length === 0) return "";
  if (list.length === 1) return `${list[0]} is typing…`;
  if (list.length === 2) return `${list[0]} and ${list[1]} are typing…`;
  return "Several people are typing…";
}

export function displaySender(message, selfId) {
  const sender = message?.sender;
  if (sender?._id && selfId && sender._id === selfId) return { name: "You", own: true, img: "" };
  if (!sender) return { name: "Deleted user", own: false, img: "" };
  const name = typeof sender.fullName === "string" && sender.fullName.trim() ? sender.fullName.trim() : "Deleted user";
  const img = typeof sender.img === "string" && isSafeMediaUrl(sender.img) ? sender.img : "";
  return { name, own: false, img };
}

export function initials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

// Object URLs belong to the component that displays them. Passing the URL
// factory in keeps server rendering from touching createObjectURL.
export function syncPreviewUrl(previousUrl, file, urlApi) {
  if (previousUrl && typeof urlApi?.revokeObjectURL === "function") urlApi.revokeObjectURL(previousUrl);
  if (!file || typeof urlApi?.createObjectURL !== "function") return null;
  return urlApi.createObjectURL(file);
}

export function focusChatToggle(doc) {
  const node = doc?.getElementById?.(PROJECT_CHAT_TOGGLE_ID) ?? null;
  if (node && typeof node.focus === "function") node.focus();
  return node;
}

function readStorage(storage, key) {
  if (!storage || typeof storage.getItem !== "function") return null;
  const raw = storage.getItem(key);
  if (typeof raw !== "string") return null;
  const parsed = JSON.parse(raw);
  if (typeof parsed?.state?.isSoundEnabled !== "boolean") return null;
  return {
    state: { isSoundEnabled: parsed.state.isSoundEnabled },
    version: typeof parsed.version === "number" ? parsed.version : 0,
  };
}

// Zustand persist hands this the whole snapshot. Only the boolean is written
// back, and a broken storage backend leaves the in-memory default in place.
export function createSoundStorage(readBackend = () => globalThis.localStorage) {
  return {
    getItem(key) {
      try {
        return readStorage(readBackend(), key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        const storage = readBackend();
        if (!storage || typeof storage.setItem !== "function") return;
        const enabled = value?.state?.isSoundEnabled;
        if (typeof enabled !== "boolean") return;
        storage.setItem(key, JSON.stringify({
          state: { isSoundEnabled: enabled },
          version: typeof value?.version === "number" ? value.version : 0,
        }));
      } catch {
        // The preference is optional. Delivery must not depend on it.
      }
    },
    removeItem(key) {
      try {
        readBackend()?.removeItem?.(key);
      } catch {
        // Ignore unavailable storage.
      }
    },
  };
}
