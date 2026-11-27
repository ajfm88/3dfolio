import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import express from "express";
import mongoose from "mongoose";
import Diagram from "../src/models/diagram.model.js";
import DiagramShare from "../src/models/diagramShare.model.js";
import DiagramVersion from "../src/models/diagramVersion.model.js";
import User from "../src/models/user.model.js";
import diagramRouter from "../src/routes/diagram.route.js";
import shareRouter from "../src/routes/share.route.js";
import { deleteUserDiagramData } from "../src/lib/diagramCleanup.js";
import { parseShareId, parseSnapshotContent } from "../src/lib/diagramSnapshots.js";
import {
  MAX_DIAGRAM_BYTES,
  MAX_OWNED_DIAGRAMS,
  MAX_STORAGE_BYTES,
  fitsStorage,
  parseDiagramBody,
  storageAfterWrite,
} from "../src/lib/diagramAccess.js";

// The production router, protectRoute, and handlers run unchanged. The model
// stub evaluates the filters and updates they send and throws on an operator
// it does not know. It is single-threaded and does not open a database.

const CLERK_BRAND = Symbol.for("@clerk/express.auth");
const ID_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ID_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const ID_C = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
const NEW_ID = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb";

const newId = () => new mongoose.Types.ObjectId();
const hex = (value) => (value && typeof value.toHexString === "function" ? value.toHexString() : String(value).toLowerCase());
const time = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

function same(a, b) {
  if (a instanceof Date || b instanceof Date) return time(a) === time(b);
  if (a && typeof a === "object" && typeof a.toHexString === "function") return hex(a) === hex(b);
  if (b && typeof b === "object" && typeof b.toHexString === "function") return hex(a) === hex(b);
  return a === b;
}

function isOperator(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && !(value instanceof Date)
    && typeof value.toHexString !== "function"
    && Object.keys(value).some((key) => key.startsWith("$"));
}

function subsetMatches(element, condition) {
  return Object.entries(condition).every(([key, value]) => {
    if (isOperator(value)) throw new Error(`unsupported element condition on ${key}`);
    return same(element?.[key], value);
  });
}

function matchDoc(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$and") return value.every((part) => matchDoc(doc, part));
    if (key === "$or") return value.some((part) => matchDoc(doc, part));
    if (key === "_id") {
      if (isOperator(value)) throw new Error("unsupported _id operator");
      return same(doc._id, value);
    }
    if (key === "diagramId") {
      if (typeof value !== "string") throw new Error("unsupported diagramId filter");
      return doc.diagramId === value;
    }
    if (key === "owner") {
      if (isOperator(value)) throw new Error("unsupported owner operator");
      return same(doc.owner, value);
    }
    if (key === "members.user") {
      if (isOperator(value)) throw new Error("unsupported members.user operator");
      return (doc.members || []).some((member) => same(member.user, value));
    }
    if (key === "revision") {
      if (typeof value !== "number") throw new Error("unsupported revision filter");
      return doc.revision === value;
    }
    throw new Error(`unsupported filter key ${key}`);
  });
}

function clone(value) {
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(value.toHexString());
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function project(doc, fields) {
  const copy = clone(doc);
  if (!fields) return copy;
  if (fields.trim() === "-content") {
    delete copy.content;
    return copy;
  }
  const names = fields.split(/\s+/).filter(Boolean);
  const excluded = new Set(names.filter((name) => name.startsWith("-")).map((name) => name.slice(1)));
  const included = names.filter((name) => !name.startsWith("-"));
  if (included.length === 0) {
    for (const name of excluded) delete copy[name];
    return copy;
  }
  const projected = {};
  if (!excluded.has("_id")) projected._id = copy._id;
  for (const name of included) projected[name] = copy[name];
  return projected;
}

function assertVersionSort(sort) {
  const keys = sort ? Object.keys(sort) : [];
  if (
    keys.length !== 2
    || keys[0] !== "createdAt"
    || keys[1] !== "_id"
    || sort.createdAt !== -1
    || sort._id !== -1
  ) {
    throw new Error(`unsupported sort ${JSON.stringify(sort)}`);
  }
}

function filterKeys(filter) {
  return Object.keys(filter ?? {}).sort();
}

function matchVersion(doc, filter) {
  const keys = filterKeys(filter);
  if (keys.length === 1 && keys[0] === "owner") {
    if (isOperator(filter.owner)) throw new Error("unsupported owner operator");
    return same(doc.owner, filter.owner);
  }
  if (keys.length === 1 && keys[0] === "diagram") {
    if (isOperator(filter.diagram)) throw new Error("unsupported diagram operator");
    return same(doc.diagram, filter.diagram);
  }
  if (keys.length === 2 && keys[0] === "diagram" && keys[1] === "versionId") {
    if (typeof filter.versionId !== "string" || isOperator(filter.diagram)) {
      throw new Error("unsupported version filter");
    }
    return same(doc.diagram, filter.diagram) && doc.versionId === filter.versionId;
  }
  throw new Error(`unsupported version filter ${keys.join(",")}`);
}

function versionDeleteShape(filter) {
  const keys = filterKeys(filter);
  if (keys.length === 1 && (keys[0] === "owner" || keys[0] === "diagram")) {
    if (isOperator(filter[keys[0]])) throw new Error(`unsupported ${keys[0]} operator`);
    return;
  }
  if (keys.length === 2 && keys[0] === "_id" && keys[1] === "diagram") {
    if (isOperator(filter.diagram)) throw new Error("unsupported diagram operator");
    const idList = filter._id && typeof filter._id === "object" ? Object.keys(filter._id) : [];
    if (idList.length !== 1 || idList[0] !== "$in" || !Array.isArray(filter._id.$in)) {
      throw new Error("unsupported _id operator");
    }
    return;
  }
  throw new Error(`unsupported version delete ${keys.join(",")}`);
}

function matchVersionDelete(doc, filter) {
  versionDeleteShape(filter);
  const keys = filterKeys(filter);
  if (keys.length === 1 && keys[0] === "owner") return same(doc.owner, filter.owner);
  if (keys.length === 1 && keys[0] === "diagram") return same(doc.diagram, filter.diagram);
  return same(doc.diagram, filter.diagram) && filter._id.$in.some((id) => same(doc._id, id));
}

function matchShare(doc, filter) {
  const keys = filterKeys(filter);
  if (keys.length === 1 && keys[0] === "owner") {
    if (isOperator(filter.owner)) throw new Error("unsupported owner operator");
    return same(doc.owner, filter.owner);
  }
  if (keys.length === 1 && keys[0] === "diagram") {
    if (isOperator(filter.diagram)) throw new Error("unsupported diagram operator");
    return same(doc.diagram, filter.diagram);
  }
  if (keys.length === 1 && keys[0] === "shareId") {
    if (typeof filter.shareId !== "string") throw new Error("unsupported shareId filter");
    return doc.shareId === filter.shareId;
  }
  if (keys.length === 1 && keys[0] === "_id") {
    if (isOperator(filter._id)) throw new Error("unsupported _id operator");
    return same(doc._id, filter._id);
  }
  throw new Error(`unsupported share filter ${keys.join(",")}`);
}

function shareDeleteShape(filter) {
  const keys = filterKeys(filter);
  if (keys.length !== 1 || (keys[0] !== "owner" && keys[0] !== "diagram")) {
    throw new Error(`unsupported share delete ${keys.join(",")}`);
  }
  if (isOperator(filter[keys[0]])) throw new Error(`unsupported ${keys[0]} operator`);
}

function assertShareSet(update) {
  const operators = Object.keys(update ?? {});
  if (operators.length !== 1 || operators[0] !== "$set") throw new Error("unsupported share update");
  const fields = Object.keys(update.$set).sort();
  if (fields.join(",") !== "content,sizeBytes,updatedBy") {
    throw new Error(`unsupported $set ${fields.join(",")}`);
  }
}

function newestFirst(rows) {
  return [...rows].sort((a, b) => {
    const byTime = time(b.createdAt) - time(a.createdAt);
    if (byTime !== 0) return byTime;
    return hex(b._id).localeCompare(hex(a._id));
  });
}

function applyUpdate(doc, update) {
  for (const [operator, body] of Object.entries(update)) {
    if (operator === "$set") {
      for (const [path, value] of Object.entries(body)) {
        if (path.includes(".") || path.startsWith("$")) throw new Error(`unsupported $set path ${path}`);
        doc[path] = clone(value);
      }
    } else if (operator === "$inc") {
      for (const [path, value] of Object.entries(body)) {
        if (typeof doc[path] !== "number" || typeof value !== "number") throw new Error(`unsupported $inc ${path}`);
        doc[path] += value;
      }
    } else if (operator === "$pull") {
      for (const [path, condition] of Object.entries(body)) {
        if (isOperator(condition) || !condition || typeof condition !== "object" || Array.isArray(condition)) {
          throw new Error(`unsupported $pull ${path}`);
        }
        if (!Array.isArray(doc[path])) throw new Error(`unsupported $pull path ${path}`);
        doc[path] = doc[path].filter((element) => !subsetMatches(element, condition));
      }
    } else {
      throw new Error(`unsupported update operator ${operator}`);
    }
  }
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    const clerkId = req.headers["x-clerk-id"];
    req.auth = Object.assign(
      () => ({ userId: typeof clerkId === "string" && clerkId ? clerkId : null, tokenType: "session_token" }),
      { [CLERK_BRAND]: true },
    );
    next();
  });
  app.use("/api/diagrams", diagramRouter);
  app.use("/api/shares", shareRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Something went wrong!" });
  });
  return app;
}

function saveBody(diagramId, extra = {}) {
  return {
    diagramId,
    name: "Billing",
    database: "postgres",
    tables: [{ name: "users" }],
    references: [],
    sqlHeader: "",
    pan: { x: 1, y: 2, z: 9 },
    zoom: 1,
    gistId: "ignored",
    loadedFromGistId: "ignored-too",
    lastModified: "2000-01-01T00:00:00.000Z",
    ...extra,
  };
}

function fakeId(n) {
  return `dddddddd-eeee-4fff-8aaa-${n.toString(16).padStart(12, "0")}`;
}

describe("diagram routes", { concurrency: false }, () => {
  const restores = [];
  let server;
  let base;
  let state;
  let users;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  afterEach(() => {
    while (restores.length > 0) restores.pop()();
  });

  function install(object, method, fn) {
    mock.method(object, method, fn);
    restores.push(() => object[method].mock.restore());
  }

  function person(name, email) {
    const user = {
      _id: newId(),
      clerkId: `clerk_${name}`,
      email,
      fullName: name,
      username: `${name}_handle`,
      role: "user",
    };
    state.users.set(hex(user._id), user);
    return user;
  }

  function member(user, role) {
    return { user: user._id, role, addedAt: new Date("2026-11-20T00:00:00.000Z") };
  }

  function addDiagram(owner, extra = {}) {
    const parsed = parseDiagramBody(saveBody(extra.diagramId ?? ID_A));
    const doc = {
      _id: extra._id ?? newId(),
      diagramId: extra.diagramId ?? ID_A,
      owner: owner._id,
      name: extra.name ?? "Billing",
      database: extra.database ?? "postgres",
      content: extra.content ?? parsed.value.content,
      sizeBytes: extra.sizeBytes ?? parsed.value.sizeBytes,
      revision: extra.revision ?? 1,
      members: extra.members ?? [],
      createdAt: extra.createdAt ?? new Date("2026-11-01T00:00:00.000Z"),
      updatedAt: extra.updatedAt ?? new Date("2026-11-01T00:00:00.000Z"),
    };
    state.diagrams.set(hex(doc._id), doc);
    return doc;
  }

  function versionIdFor(n) {
    return n.toString(16).padStart(40, "0");
  }

  function nextVersionDate() {
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, state.versionSeq));
    state.versionSeq += 1;
    return createdAt;
  }

  function addVersion(diagram, extra = {}) {
    const content = extra.content ?? JSON.stringify({ tables: [], n: state.versions.size });
    const parsed = parseSnapshotContent(content);
    if (!parsed.ok) throw new Error(parsed.message);
    const doc = {
      _id: extra._id ?? newId(),
      versionId: extra.versionId ?? versionIdFor(state.versions.size + 1),
      diagram: extra.diagram ?? diagram._id,
      owner: extra.owner ?? diagram.owner,
      recordedBy: extra.recordedBy ?? diagram.owner,
      content: extra.storedContent ?? parsed.value.content,
      contentHash: extra.contentHash ?? parsed.value.contentHash,
      sizeBytes: extra.sizeBytes ?? parsed.value.sizeBytes,
      createdAt: extra.createdAt ?? nextVersionDate(),
    };
    state.versions.set(hex(doc._id), doc);
    return doc;
  }

  function addShare(diagram, extra = {}) {
    const content = extra.content ?? JSON.stringify({ tables: [] });
    const parsed = parseSnapshotContent(content);
    if (!parsed.ok) throw new Error(parsed.message);
    const shareId = extra.shareId ?? `share${state.shares.size.toString(16).padStart(17, "0")}`;
    const doc = {
      _id: extra._id ?? newId(),
      shareId,
      diagram: extra.diagram ?? diagram._id,
      owner: extra.owner ?? diagram.owner,
      updatedBy: extra.updatedBy ?? diagram.owner,
      content: extra.storedContent ?? parsed.value.content,
      sizeBytes: extra.sizeBytes ?? parsed.value.sizeBytes,
      createdAt: extra.createdAt ?? new Date("2026-11-26T00:00:00.000Z"),
      updatedAt: extra.updatedAt ?? new Date("2026-11-26T00:00:00.000Z"),
    };
    state.shares.set(hex(doc._id), doc);
    return doc;
  }

  function rowsFor(filter, record) {
    let rows = [...state.diagrams.values()].filter((doc) => matchDoc(doc, filter));
    if (record.sort) {
      const entries = Object.entries(record.sort);
      if (entries.length !== 1 || entries[0][0] !== "updatedAt" || ![1, -1].includes(entries[0][1])) {
        throw new Error(`unsupported sort ${JSON.stringify(record.sort)}`);
      }
      const direction = entries[0][1];
      rows = [...rows].sort((a, b) => (time(a.updatedAt) - time(b.updatedAt)) * direction);
    }
    return rows.map((doc) => project(doc, record.select));
  }

  beforeEach(() => {
    state = {
      diagrams: new Map(),
      users: new Map(),
      reads: [],
      counts: [],
      creates: [],
      updates: [],
      deletes: [],
      updateMany: [],
      userFinds: [],
      userFindOnes: [],
      versions: new Map(),
      shares: new Map(),
      versionReads: [],
      versionCreates: [],
      versionDeletes: [],
      shareReads: [],
      shareCreates: [],
      shareUpdates: [],
      shareDeletes: [],
      events: [],
      versionSeq: 0,
      shareCreateConflict: null,
      createError: null,
      disappearBeforeUpdate: false,
    };
    users = {
      owner: person("owner", "owner@example.com"),
      editor: person("editor", "editor@example.com"),
      viewer: person("viewer", "viewer@example.com"),
      outsider: person("outsider", "outsider@example.com"),
    };

    install(User, "findOne", (filter) => {
      state.userFindOnes.push(filter);
      if (!filter || Object.keys(filter).length !== 1 || !Object.hasOwn(filter, "clerkId")) {
        throw new Error(`unsupported User.findOne ${JSON.stringify(filter)}`);
      }
      const found = [...state.users.values()].find((user) => user.clerkId === filter.clerkId);
      return Promise.resolve(found ? { ...found } : null);
    });

    install(User, "find", (filter) => {
      const idQuery = filter?._id;
      const filterKeys = filter && typeof filter === "object" && !Array.isArray(filter) ? Object.keys(filter) : [];
      const idKeys = idQuery && typeof idQuery === "object" && !Array.isArray(idQuery) ? Object.keys(idQuery) : [];
      if (
        filterKeys.length !== 1
        || !Object.hasOwn(filter, "_id")
        || idKeys.length !== 1
        || !Object.hasOwn(idQuery, "$in")
        || !Array.isArray(idQuery.$in)
      ) {
        throw new Error("unsupported User.find");
      }
      const record = { filter, select: null };
      state.userFinds.push(record);
      const api = {
        select(value) {
          if (typeof value !== "string") throw new Error("unsupported user select");
          record.select = value;
          return api;
        },
        lean() {
          const ids = filter._id.$in.map(hex);
          const fields = (record.select ?? "").split(/\s+/).filter(Boolean);
          const rows = [...state.users.values()]
            .filter((user) => ids.includes(hex(user._id)))
            .map((user) => Object.fromEntries(fields.map((field) => [field, user[field]])));
          return Promise.resolve(rows);
        },
      };
      return api;
    });

    for (const method of ["create", "updateOne", "findOneAndUpdate", "deleteOne", "deleteMany"]) {
      install(User, method, () => {
        throw new Error("users are written only by the webhook");
      });
    }

    install(Diagram, "find", (filter) => {
      const record = { op: "find", filter, select: null, sort: null };
      state.reads.push(record);
      const api = {
        select(value) {
          if (typeof value !== "string") throw new Error(`unsupported select ${value}`);
          record.select = value;
          return api;
        },
        sort(value) {
          record.sort = value;
          return api;
        },
        lean() {
          return Promise.resolve(rowsFor(filter, record));
        },
        then(resolve, reject) {
          return api.lean().then(resolve, reject);
        },
      };
      return api;
    });

    install(Diagram, "findOne", (filter) => {
      const record = { op: "findOne", filter, select: null, sort: null };
      state.reads.push(record);
      const api = {
        select(value) {
          record.select = value;
          return api;
        },
        lean() {
          return Promise.resolve(rowsFor(filter, record)[0] ?? null);
        },
        then(resolve, reject) {
          return api.lean().then(resolve, reject);
        },
      };
      return api;
    });

    install(Diagram, "countDocuments", async (filter) => {
      state.counts.push(filter);
      return [...state.diagrams.values()].filter((doc) => matchDoc(doc, filter)).length;
    });

    install(Diagram, "create", async (doc) => {
      state.creates.push(doc);
      if (state.createError) throw state.createError;
      if ([...state.diagrams.values()].some((row) => row.diagramId === doc.diagramId)) {
        const error = new Error("E11000 duplicate key");
        error.code = 11000;
        throw error;
      }
      const stored = {
        _id: newId(),
        createdAt: new Date("2026-11-25T12:00:00.000Z"),
        updatedAt: new Date("2026-11-25T12:00:00.000Z"),
        ...clone(doc),
      };
      state.diagrams.set(hex(stored._id), stored);
      return clone(stored);
    });

    install(Diagram, "updateOne", async (filter, update) => {
      state.updates.push({ filter, update });
      if (state.disappearBeforeUpdate) {
        state.diagrams.clear();
        return { matchedCount: 0, modifiedCount: 0 };
      }
      const doc = [...state.diagrams.values()].find((candidate) => matchDoc(candidate, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(doc, update);
      doc.updatedAt = new Date("2026-11-25T13:00:00.000Z");
      return { matchedCount: 1, modifiedCount: 1 };
    });

    install(Diagram, "deleteOne", async (filter) => {
      state.events.push("diagram.deleteOne");
      state.deletes.push(filter);
      const entry = [...state.diagrams.entries()].find(([, doc]) => matchDoc(doc, filter));
      if (!entry) return { deletedCount: 0 };
      state.diagrams.delete(entry[0]);
      return { deletedCount: 1 };
    });

    install(Diagram, "updateMany", async (filter, update) => {
      state.updateMany.push({ filter, update });
      let matched = 0;
      for (const doc of state.diagrams.values()) {
        if (!matchDoc(doc, filter)) continue;
        applyUpdate(doc, update);
        matched += 1;
      }
      return { matchedCount: matched, modifiedCount: matched };
    });

    install(DiagramVersion, "find", (filter) => {
      const record = { op: "find", filter, select: null, sort: null };
      state.versionReads.push(record);
      const api = {
        select(value) {
          if (value !== "-content" && value !== "sizeBytes") throw new Error(`unsupported select ${value}`);
          record.select = value;
          return api;
        },
        sort(value) {
          assertVersionSort(value);
          record.sort = value;
          return api;
        },
        lean() {
          if (record.select === "-content") {
            if (!record.sort) throw new Error("version metadata read is missing its sort");
          } else if (record.select === "sizeBytes") {
            if (record.sort) throw new Error("unsupported sort on sizeBytes");
          } else {
            throw new Error(`unsupported select ${record.select}`);
          }
          const keys = filterKeys(filter);
          if (keys.length !== 1 || (keys[0] !== "diagram" && keys[0] !== "owner")) {
            throw new Error(`unsupported version find ${keys.join(",")}`);
          }
          let rows = [...state.versions.values()].filter((doc) => matchVersion(doc, filter));
          if (record.sort) rows = newestFirst(rows);
          return Promise.resolve(rows.map((doc) => project(doc, record.select)));
        },
      };
      return api;
    });

    install(DiagramVersion, "findOne", (filter) => {
      const record = { op: "findOne", filter, select: null };
      state.versionReads.push(record);
      const api = {
        select(value) {
          throw new Error(`unsupported select ${value}`);
        },
        lean() {
          const keys = filterKeys(filter);
          if (keys.join(",") !== "diagram,versionId") throw new Error(`unsupported version findOne ${keys.join(",")}`);
          const row = [...state.versions.values()].find((doc) => matchVersion(doc, filter));
          return Promise.resolve(row ? clone(row) : null);
        },
      };
      return api;
    });

    install(DiagramVersion, "create", async (doc) => {
      state.versionCreates.push(doc);
      const stored = {
        _id: newId(),
        createdAt: nextVersionDate(),
        ...clone(doc),
      };
      state.versions.set(hex(stored._id), stored);
      return clone(stored);
    });

    install(DiagramVersion, "deleteMany", async (filter) => {
      state.events.push("version.deleteMany");
      state.versionDeletes.push(filter);
      versionDeleteShape(filter);
      let deleted = 0;
      for (const [key, doc] of [...state.versions.entries()]) {
        if (!matchVersionDelete(doc, filter)) continue;
        state.versions.delete(key);
        deleted += 1;
      }
      return { deletedCount: deleted };
    });

    install(DiagramShare, "find", (filter) => {
      const record = { op: "find", filter, select: null };
      state.shareReads.push(record);
      const api = {
        select(value) {
          if (value !== "sizeBytes") throw new Error(`unsupported select ${value}`);
          record.select = value;
          return api;
        },
        sort(value) {
          throw new Error(`unsupported sort ${JSON.stringify(value)}`);
        },
        lean() {
          if (record.select !== "sizeBytes") throw new Error(`unsupported select ${record.select}`);
          if (filterKeys(filter).join(",") !== "owner") throw new Error("unsupported share find");
          const rows = [...state.shares.values()].filter((doc) => matchShare(doc, filter));
          return Promise.resolve(rows.map((doc) => project(doc, record.select)));
        },
      };
      return api;
    });

    install(DiagramShare, "findOne", (filter) => {
      const record = { op: "findOne", filter };
      state.shareReads.push(record);
      const api = {
        select() {
          throw new Error("unsupported share select");
        },
        lean() {
          const keys = filterKeys(filter).join(",");
          if (keys !== "diagram" && keys !== "shareId") throw new Error(`unsupported share findOne ${keys}`);
          const row = [...state.shares.values()].find((doc) => matchShare(doc, filter));
          return Promise.resolve(row ? clone(row) : null);
        },
      };
      return api;
    });

    install(DiagramShare, "create", async (doc) => {
      state.shareCreates.push(doc);
      if (state.shareCreateConflict) {
        const planted = state.shareCreateConflict;
        state.shareCreateConflict = null;
        state.shares.set(hex(planted._id), planted);
        const error = new Error("E11000 duplicate key");
        error.code = 11000;
        throw error;
      }
      if ([...state.shares.values()].some((row) => same(row.diagram, doc.diagram) || row.shareId === doc.shareId)) {
        const error = new Error("E11000 duplicate key");
        error.code = 11000;
        throw error;
      }
      const stored = {
        _id: newId(),
        createdAt: new Date("2026-11-26T12:00:00.000Z"),
        updatedAt: new Date("2026-11-26T12:00:00.000Z"),
        ...clone(doc),
      };
      state.shares.set(hex(stored._id), stored);
      return clone(stored);
    });

    install(DiagramShare, "updateOne", async (filter, update) => {
      state.shareUpdates.push({ filter, update });
      if (filterKeys(filter).join(",") !== "_id" || isOperator(filter._id)) {
        throw new Error("unsupported share update filter");
      }
      assertShareSet(update);
      const doc = [...state.shares.values()].find((candidate) => matchShare(candidate, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(doc, update);
      return { matchedCount: 1, modifiedCount: 1 };
    });

    install(DiagramShare, "deleteOne", async (filter) => {
      state.events.push("share.deleteOne");
      state.shareDeletes.push(filter);
      if (filterKeys(filter).join(",") !== "diagram" || isOperator(filter.diagram)) {
        throw new Error("unsupported share deleteOne");
      }
      const entry = [...state.shares.entries()].find(([, doc]) => matchShare(doc, filter));
      if (!entry) return { deletedCount: 0 };
      state.shares.delete(entry[0]);
      return { deletedCount: 1 };
    });

    install(DiagramShare, "deleteMany", async (filter) => {
      state.events.push("share.deleteMany");
      state.shareDeletes.push(filter);
      shareDeleteShape(filter);
      let deleted = 0;
      for (const [key, doc] of [...state.shares.entries()]) {
        if (!matchShare(doc, filter)) continue;
        state.shares.delete(key);
        deleted += 1;
      }
      return { deletedCount: deleted };
    });

    const unused = [
      "updateMany",
      "findOneAndUpdate",
      "findOneAndDelete",
      "findOneAndReplace",
      "findById",
      "findByIdAndUpdate",
      "findByIdAndDelete",
      "countDocuments",
      "aggregate",
      "insertMany",
      "replaceOne",
      "exists",
      "distinct",
      "bulkWrite",
      "estimatedDocumentCount",
    ];
    for (const method of [...unused, "updateOne", "deleteOne"]) {
      install(DiagramVersion, method, () => {
        throw new Error(`DiagramVersion.${method} is not used`);
      });
    }
    for (const method of unused) {
      install(DiagramShare, method, () => {
        throw new Error(`DiagramShare.${method} is not used`);
      });
    }
  });

  async function call(user, method, path, body) {
    const response = await fetch(`${base}/api/diagrams${path}`, {
      method,
      headers: {
        ...(user ? { "x-clerk-id": user.clerkId } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    assert.notEqual(response.status, 402);
    return { status: response.status, body: parsed };
  }

  async function callShare(path) {
    const response = await fetch(`${base}/api/shares${path}`);
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    assert.notEqual(response.status, 402);
    return {
      status: response.status,
      body: parsed,
      cacheControl: response.headers.get("cache-control"),
    };
  }

  function stored(doc) {
    return state.diagrams.get(hex(doc._id));
  }

  it("registers the eleven routes behind protectRoute", () => {
    const paths = diagramRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
    assert.equal(diagramRouter.stack[0].handle.name, "protectRoute");
    assert.deepEqual(paths, [
      "get /",
      "post /",
      "get /:diagramId",
      "put /:diagramId",
      "delete /:diagramId",
      "get /:diagramId/versions",
      "post /:diagramId/versions",
      "get /:diagramId/versions/:versionId",
      "get /:diagramId/versions/:versionA/compare/:versionB",
      "put /:diagramId/share",
      "delete /:diagramId/share",
    ]);
  });

  it("mounts CORS before the diagram parser and the diagram routes after projects", () => {
    const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
    const webhook = source.indexOf('app.use("/api/webhooks/clerk"');
    const cors = source.indexOf("app.use(cors(");
    const diagramJson = source.indexOf('app.use("/api/diagrams", express.json({ limit: "2mb" }));');
    const globalJson = source.indexOf("app.use(express.json());");
    const projects = source.indexOf('app.use("/api/projects", projectRoutes);');
    const diagrams = source.indexOf('app.use("/api/diagrams", diagramRoutes);');
    const lines = source.split(/\r?\n/);
    const diagramImport = lines.findIndex((line) => line === 'import diagramRoutes from "./routes/diagram.route.js";');
    const shareImport = lines.findIndex((line) => line === 'import shareRoutes from "./routes/share.route.js";');
    const diagramMount = lines.findIndex((line) => line === 'app.use("/api/diagrams", diagramRoutes);');
    const shareMount = lines.findIndex((line) => line === 'app.use("/api/shares", shareRoutes);');
    assert.ok(webhook >= 0 && webhook < cors);
    assert.ok(cors < diagramJson && diagramJson < globalJson);
    assert.ok(projects >= 0 && projects < diagrams);
    assert.equal(source.includes('res.send("3dfolio API'), true);
    assert.equal(shareImport, diagramImport + 1);
    assert.equal(shareMount, diagramMount + 1);
  });

  it("calls diagram cleanup after collaborate cleanup and before the user row is deleted", () => {
    const source = readFileSync(new URL("../src/webhooks/clerk.webhook.js", import.meta.url), "utf8");
    const collab = source.indexOf("if (doomed) await deleteUserCollaborateData(io, doomed);");
    const diagrams = source.indexOf("if (doomed) await deleteUserDiagramData(doomed);");
    const removeUser = source.indexOf("User.findOneAndDelete");
    assert.ok(collab >= 0 && diagrams > collab && removeUser > diagrams);
  });

  it("throws when an _id filter is an operator object", () => {
    const id = newId();
    assert.throws(() => matchDoc({ _id: id }, { _id: { $ne: id } }), /unsupported _id operator/);
  });

  it("throws when User.find is given any filter besides _id $in", () => {
    assert.throws(
      () => User.find({ _id: { $in: [users.owner._id] }, email: users.owner.email }),
      /unsupported User.find/,
    );
  });

  it("answers 401 signed out on all eleven routes", async () => {
    const diagram = addDiagram(users.owner);
    const versionId = "a".repeat(40);
    const routes = [
      ["GET", "/"],
      ["POST", "/", saveBody(NEW_ID)],
      ["GET", `/${diagram.diagramId}`],
      ["PUT", `/${diagram.diagramId}`, saveBody(diagram.diagramId, { baseRevision: 1 })],
      ["DELETE", `/${diagram.diagramId}`],
      ["GET", `/${diagram.diagramId}/versions`],
      ["POST", `/${diagram.diagramId}/versions`, { content: "{\"tables\":[]}" }],
      ["GET", `/${diagram.diagramId}/versions/${versionId}`],
      ["GET", `/${diagram.diagramId}/versions/${versionId}/compare/null`],
      ["PUT", `/${diagram.diagramId}/share`, { content: "{\"tables\":[]}" }],
      ["DELETE", `/${diagram.diagramId}/share`],
    ];
    for (const [method, path, body] of routes) {
      const response = await call(null, method, path, body);
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.deepEqual(response.body, { message: "Unauthorized" });
    }
    assert.equal(state.creates.length, 0);
    assert.equal(state.updates.length, 0);
    assert.equal(state.deletes.length, 0);
    assert.equal(state.versionCreates.length, 0);
    assert.equal(state.shareCreates.length, 0);
  });

  it("answers 404 for a signed-in user who has not been synced", async () => {
    const response = await call({ clerkId: "clerk_ghost" }, "GET", "/");
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { message: "User profile is not synced yet" });
    assert.equal(state.reads.length, 0);
  });

  describe("list", () => {
    it("returns owned and member diagrams newest first, with userId and without content", async () => {
      const older = addDiagram(users.owner, {
        diagramId: ID_A,
        content: "SECRET_CONTENT_MARKER_A",
        updatedAt: new Date("2026-11-01T00:00:00.000Z"),
      });
      const shared = addDiagram(users.outsider, {
        diagramId: ID_B,
        name: "Shared",
        content: "SECRET_CONTENT_MARKER_B",
        members: [member(users.owner, "editor")],
        updatedAt: new Date("2026-11-20T00:00:00.000Z"),
      });
      const newer = addDiagram(users.owner, {
        diagramId: ID_C,
        content: "SECRET_CONTENT_MARKER_C",
        members: [member(users.owner, "viewer")],
        updatedAt: new Date("2026-11-10T00:00:00.000Z"),
      });
      addDiagram(users.editor, {
        diagramId: "eeeeeeee-ffff-4aaa-8bbb-cccccccccccc",
        content: "SECRET_CONTENT_MARKER_HIDDEN",
        updatedAt: new Date("2026-11-25T00:00:00.000Z"),
      });

      const response = await call(users.owner, "GET", "/");
      assert.equal(response.status, 200);
      assert.equal(response.body.userId, hex(users.owner._id));
      assert.deepEqual(response.body.diagrams.map((item) => item.diagramId), [ID_B, ID_C, ID_A]);
      assert.deepEqual(response.body.diagrams.map((item) => item.role), ["editor", "owner", "owner"]);
      assert.equal(JSON.stringify(response.body).includes("SECRET_CONTENT"), false);
      for (const item of response.body.diagrams) {
        assert.deepEqual(Object.keys(item).sort(), [
          "database", "diagramId", "lastModified", "name", "owner", "role", "sizeBytes",
        ]);
        assert.equal(Object.hasOwn(item, "content"), false);
        assert.equal(Object.hasOwn(item, "members"), false);
        assert.equal(Object.hasOwn(item, "revision"), false);
      }
      assert.equal(response.body.diagrams[1].diagramId, newer.diagramId);
      assert.equal(response.body.diagrams[2].diagramId, older.diagramId);
      assert.deepEqual(response.body.diagrams[0].owner, {
        id: hex(users.outsider._id),
        username: "outsider",
        email: "outsider@example.com",
      });
      assert.equal(response.body.diagrams[0].name, shared.name);

      const listRead = state.reads.find((read) => read.op === "find");
      assert.equal(listRead.select, "-content");
      assert.deepEqual(listRead.sort, { updatedAt: -1 });
      assert.equal(hex(listRead.filter.$or[0].owner), hex(users.owner._id));
      assert.equal(hex(listRead.filter.$or[1]["members.user"]), hex(users.owner._id));
      assert.equal(state.userFinds[0].select, "_id fullName username email");
      assert.equal(state.userFinds.length, 1);
    });

    it("returns an empty list without loading owners", async () => {
      const response = await call(users.owner, "GET", "/");
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { userId: hex(users.owner._id), diagrams: [] });
      assert.equal(state.userFinds.length, 0);
      assert.equal(state.reads[0].select, "-content");
    });
  });

  describe("create", () => {
    it("creates a diagram owned by the caller", async () => {
      const response = await call(users.owner, "POST", "/", saveBody(NEW_ID.toUpperCase(), { name: "  Billing  " }));
      assert.equal(response.status, 201);
      assert.deepEqual(response.body, {
        diagramId: NEW_ID,
        revision: 1,
        lastModified: "2026-11-25T12:00:00.000Z",
        sizeBytes: parseDiagramBody(saveBody(NEW_ID, { name: "  Billing  " })).value.sizeBytes,
      });
      const created = state.creates[0];
      assert.equal(hex(created.owner), hex(users.owner._id));
      assert.equal(created.diagramId, NEW_ID);
      assert.equal(created.revision, 1);
      assert.deepEqual(created.members, []);
      assert.equal(created.name, "Billing");
      assert.equal(created.database, "postgres");
      assert.deepEqual(Object.keys(created).sort(), [
        "content", "database", "diagramId", "members", "name", "owner", "revision", "sizeBytes",
      ]);
      const content = JSON.parse(created.content);
      assert.equal(content.gistId, undefined);
      assert.deepEqual(content.pan, { x: 1, y: 2 });
      assert.equal(state.counts.length, 1);
      assert.equal(hex(state.counts[0].owner), hex(users.owner._id));
      assert.equal(state.reads.find((read) => read.op === "find").select, "sizeBytes");
    });

    it("rejects a bad id before the quota checks", async () => {
      const response = await call(users.owner, "POST", "/", saveBody(" nope"));
      assert.equal(response.status, 400);
      assert.deepEqual(response.body, { message: "Invalid diagram id" });
      assert.equal(state.counts.length, 0);
      assert.equal(state.creates.length, 0);
    });

    it("rejects a duplicate id with 409, including a thrown 11000", async () => {
      const first = await call(users.owner, "POST", "/", saveBody(NEW_ID));
      assert.equal(first.status, 201);
      const duplicate = await call(users.owner, "POST", "/", saveBody(NEW_ID, { name: "Other" }));
      assert.equal(duplicate.status, 409);
      assert.deepEqual(duplicate.body, { message: "A diagram with this id already exists" });
      assert.equal([...state.diagrams.values()].filter((doc) => doc.diagramId === NEW_ID).length, 1);

      state.diagrams.clear();
      state.createError = Object.assign(new Error("duplicate key"), { code: 11000 });
      const forced = await call(users.owner, "POST", "/", saveBody(ID_A));
      assert.equal(forced.status, 409);
      assert.deepEqual(forced.body, { message: "A diagram with this id already exists" });
      assert.equal(state.diagrams.size, 0);
    });

    it("rejects the 51st owned diagram and still allows the 50th", async () => {
      for (let n = 1; n <= MAX_OWNED_DIAGRAMS - 1; n += 1) {
        addDiagram(users.owner, { diagramId: fakeId(n), sizeBytes: 1 });
      }
      const fiftieth = await call(users.owner, "POST", "/", saveBody(NEW_ID));
      assert.equal(fiftieth.status, 201);
      const over = await call(users.owner, "POST", "/", saveBody(ID_B));
      assert.equal(over.status, 400);
      assert.deepEqual(over.body, { message: "You can keep up to 50 cloud diagrams" });
      assert.equal(state.creates.at(-1).diagramId, NEW_ID);
    });

    it("rejects a diagram whose content is over 1 MiB before the count check", async () => {
      for (let n = 1; n <= MAX_OWNED_DIAGRAMS; n += 1) {
        addDiagram(users.owner, { diagramId: fakeId(n), sizeBytes: 1 });
      }
      const response = await call(users.owner, "POST", "/", saveBody(NEW_ID, {
        sqlHeader: `é${"a".repeat(MAX_DIAGRAM_BYTES)}`,
      }));
      assert.equal(response.status, 413);
      assert.deepEqual(response.body, { message: "Diagram is too large" });
      assert.equal(state.counts.length, 0);
      assert.equal(state.creates.length, 0);
    });

    it("rejects a create that would pass the owner's storage limit", async () => {
      const incoming = parseDiagramBody(saveBody(NEW_ID));
      addDiagram(users.owner, { diagramId: ID_A, sizeBytes: MAX_STORAGE_BYTES - incoming.value.sizeBytes });
      const fits = await call(users.owner, "POST", "/", saveBody(NEW_ID));
      assert.equal(fits.status, 201);

      state.diagrams.clear();
      addDiagram(users.editor, { diagramId: ID_A, sizeBytes: MAX_STORAGE_BYTES - incoming.value.sizeBytes + 1 });
      const over = await call(users.editor, "POST", "/", saveBody(ID_B));
      assert.equal(over.status, 413);
      assert.deepEqual(over.body, { message: "Storage limit reached" });
      assert.equal([...state.diagrams.values()].some((doc) => doc.diagramId === ID_B), false);
      const storageRead = state.reads.filter((read) => read.op === "find").at(-1);
      assert.equal(storageRead.select, "sizeBytes");
      assert.equal(hex(storageRead.filter.owner), hex(users.editor._id));
    });

    it("surfaces a persistence error that is not a duplicate key", async () => {
      state.createError = new Error("database unavailable");
      const response = await call(users.owner, "POST", "/", saveBody(NEW_ID));
      assert.equal(response.status, 500);
      assert.equal(response.body.message, "database unavailable");
    });
  });

  describe("get", () => {
    it("returns the diagram for the owner, an editor, and a viewer", async () => {
      const diagram = addDiagram(users.owner, {
        members: [member(users.editor, "editor"), member(users.viewer, "viewer")],
        revision: 4,
      });
      const expectedContent = JSON.parse(diagram.content);
      for (const [user, role, canWrite] of [
        [users.owner, "owner", true],
        [users.editor, "editor", true],
        [users.viewer, "viewer", false],
      ]) {
        const response = await call(user, "GET", `/${ID_A.toUpperCase()}`);
        assert.equal(response.status, 200, role);
        assert.equal(response.body.role, role);
        assert.equal(response.body.canWrite, canWrite);
        assert.equal(response.body.revision, 4);
        assert.equal(response.body.diagramId, ID_A);
        assert.equal(response.body.name, "Billing");
        assert.deepEqual(response.body.tables, expectedContent.tables);
        assert.deepEqual(response.body.pan, { x: 1, y: 2 });
        assert.equal(response.body.lastModified, diagram.updatedAt.toISOString());
        assert.equal(Object.hasOwn(response.body, "content"), false);
        assert.equal(Object.hasOwn(response.body, "members"), false);
        assert.deepEqual(response.body.owner, {
          id: hex(users.owner._id),
          username: "owner",
          email: "owner@example.com",
        });
      }
      const lookup = state.reads.find((read) => read.op === "findOne");
      assert.equal(lookup.filter.diagramId, ID_A);
      assert.equal(hex(lookup.filter.$or[0].owner), hex(users.owner._id));
    });

    it("returns owner null when that user row is gone", async () => {
      addDiagram(users.owner, { members: [member(users.editor, "editor")] });
      state.users.delete(hex(users.owner._id));
      const response = await call(users.editor, "GET", `/${ID_A}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.owner, null);
      assert.equal(response.body.role, "editor");
    });

    it("answers 404 with the same body for a stranger and a malformed id", async () => {
      addDiagram(users.owner);
      const stranger = await call(users.outsider, "GET", `/${ID_A}`);
      const readsAfterStranger = state.reads.length;
      const malformed = await call(users.owner, "GET", "/not-a-uuid");
      const spaced = await call(users.owner, "GET", `/${encodeURIComponent(` ${ID_A}`)}`);
      assert.equal(stranger.status, 404);
      assert.equal(malformed.status, 404);
      assert.equal(spaced.status, 404);
      assert.deepEqual(stranger.body, { message: "Diagram not found" });
      assert.deepEqual(malformed.body, stranger.body);
      assert.deepEqual(spaced.body, stranger.body);
      assert.equal(state.reads.length, readsAfterStranger);
      assert.equal(state.reads[0].op, "findOne");
    });
  });

  describe("update", () => {
    it("increments the revision and stores the new content for the path id", async () => {
      const diagram = addDiagram(users.owner, { revision: 1, members: [member(users.viewer, "viewer")] });
      const body = saveBody(ID_B, {
        baseRevision: 1,
        name: "  Renamed  ",
        database: "mysql",
        tables: [{ name: "invoices" }],
      });
      const response = await call(users.owner, "PUT", `/${ID_A}`, body);
      const parsed = parseDiagramBody(body);
      assert.equal(response.status, 200);
      assert.equal(response.body.diagramId, ID_A);
      assert.equal(response.body.revision, 2);
      assert.equal(response.body.sizeBytes, parsed.value.sizeBytes);
      assert.equal(new Date(response.body.lastModified).toISOString(), response.body.lastModified);
      const saved = stored(diagram);
      assert.equal(saved.revision, 2);
      assert.equal(saved.name, "Renamed");
      assert.equal(saved.database, "mysql");
      assert.equal(saved.diagramId, ID_A);
      assert.equal(saved.content, parsed.value.content);
      assert.equal(saved.members.length, 1);
      assert.equal(hex(state.updates[0].filter._id), hex(diagram._id));
      assert.equal(state.updates[0].filter.revision, 1);
      assert.equal(state.updates[0].update.$inc.revision, 1);
      assert.equal(state.updates[0].update.$set.content, parsed.value.content);
      assert.equal(state.updates[0].update.$set.name, "Renamed");
    });

    it("returns 409 with the current revision when baseRevision is stale", async () => {
      const diagram = addDiagram(users.owner, { revision: 5, content: "{\"keep\":true}" });
      const response = await call(users.owner, "PUT", `/${ID_A}`, saveBody(ID_A, {
        baseRevision: 4,
        name: "Changed",
      }));
      assert.equal(response.status, 409);
      assert.deepEqual(response.body, {
        message: "This diagram was changed somewhere else",
        revision: 5,
      });
      assert.equal(stored(diagram).revision, 5);
      assert.equal(stored(diagram).content, "{\"keep\":true}");
      assert.equal(stored(diagram).name, "Billing");
    });

    it("returns 404 when the diagram disappears before the revision write", async () => {
      addDiagram(users.owner, { revision: 2 });
      state.disappearBeforeUpdate = true;
      const response = await call(users.owner, "PUT", `/${ID_A}`, saveBody(ID_A, { baseRevision: 2 }));
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { message: "Diagram not found" });
    });

    it("rejects a viewer before reading baseRevision", async () => {
      const diagram = addDiagram(users.owner, { members: [member(users.viewer, "viewer")] });
      const response = await call(users.viewer, "PUT", `/${ID_A}`, { name: "Nope" });
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { message: "You can only view this diagram" });
      assert.equal(state.updates.length, 0);
      assert.equal(state.reads.some((read) => read.op === "find"), false);
      assert.equal(stored(diagram).name, "Billing");
    });

    it("hides a stranger behind the same 404 as a missing diagram", async () => {
      addDiagram(users.owner);
      const stranger = await call(users.outsider, "PUT", `/${ID_A}`, saveBody(ID_A, { baseRevision: 1 }));
      const malformed = await call(users.owner, "PUT", "/bad id", saveBody(ID_A, { baseRevision: 1 }));
      assert.equal(stranger.status, 404);
      assert.deepEqual(stranger.body, { message: "Diagram not found" });
      assert.deepEqual(malformed.body, stranger.body);
      assert.equal(state.updates.length, 0);
    });

    it("rejects a bad baseRevision before the body is parsed", async () => {
      const diagram = addDiagram(users.owner);
      for (const baseRevision of [0, -1, 1.5, "2", null]) {
        const response = await call(users.owner, "PUT", `/${ID_A}`, { baseRevision });
        assert.equal(response.status, 400, String(baseRevision));
        assert.deepEqual(response.body, { message: "baseRevision must be a positive whole number" });
      }
      const missing = await call(users.owner, "PUT", `/${ID_A}`, { tables: "no" });
      assert.equal(missing.status, 400);
      assert.deepEqual(missing.body, { message: "baseRevision must be a positive whole number" });
      assert.equal(state.updates.length, 0);
      assert.equal(stored(diagram).revision, 1);
    });

    it("rejects an oversized update before the storage check", async () => {
      addDiagram(users.owner, { members: [member(users.editor, "editor")] });
      const response = await call(users.editor, "PUT", `/${ID_A}`, saveBody(ID_A, {
        baseRevision: 1,
        sqlHeader: `é${"a".repeat(MAX_DIAGRAM_BYTES)}`,
      }));
      assert.equal(response.status, 413);
      assert.deepEqual(response.body, { message: "Diagram is too large" });
      assert.equal(state.reads.some((read) => read.op === "find"), false);
      assert.equal(state.updates.length, 0);
    });

    it("charges the owner's storage, replaces the old size, and lets an editor write", async () => {
      const small = parseDiagramBody(saveBody(ID_A, { name: "Edited", tables: [{ name: "next" }] }));
      const wide = parseDiagramBody(saveBody(ID_A, { sqlHeader: `é${"a".repeat(900_000)}` }));
      assert.equal(wide.ok, true);
      assert.equal(fitsStorage(storageAfterWrite({
        usedBytes: MAX_STORAGE_BYTES,
        oldBytes: 24 * MAX_DIAGRAM_BYTES,
        newBytes: small.value.sizeBytes,
      })), true);
      assert.equal(fitsStorage(storageAfterWrite({
        usedBytes: MAX_STORAGE_BYTES,
        oldBytes: 0,
        newBytes: small.value.sizeBytes,
      })), false);
      assert.equal(fitsStorage(storageAfterWrite({
        usedBytes: MAX_STORAGE_BYTES,
        oldBytes: 1000,
        newBytes: wide.value.sizeBytes,
      })), false);
      assert.equal(fitsStorage(storageAfterWrite({
        usedBytes: 0,
        oldBytes: 1000,
        newBytes: wide.value.sizeBytes,
      })), true);

      const edited = addDiagram(users.owner, {
        diagramId: ID_A,
        sizeBytes: 24 * MAX_DIAGRAM_BYTES,
        members: [member(users.editor, "editor")],
      });
      addDiagram(users.owner, { diagramId: ID_B, sizeBytes: MAX_DIAGRAM_BYTES });
      const success = await call(users.editor, "PUT", `/${ID_A}`, saveBody(ID_C, {
        baseRevision: 1,
        name: "Edited",
        tables: [{ name: "next" }],
      }));
      assert.equal(success.status, 200);
      assert.equal(success.body.revision, 2);
      assert.equal(stored(edited).content, small.value.content);
      assert.equal(stored(edited).name, "Edited");
      assert.equal(hex(state.reads.find((read) => read.op === "find").filter.owner), hex(users.owner._id));
      assert.equal(state.reads.find((read) => read.op === "find").select, "sizeBytes");

      stored(edited).sizeBytes = 1000;
      stored(edited).revision = 2;
      const other = [...state.diagrams.values()].find((doc) => doc.diagramId === ID_B);
      other.sizeBytes = MAX_STORAGE_BYTES - 1000;
      const blocked = await call(users.editor, "PUT", `/${ID_A}`, saveBody(ID_A, {
        baseRevision: 2,
        sqlHeader: `é${"a".repeat(900_000)}`,
      }));
      assert.equal(blocked.status, 413);
      assert.deepEqual(blocked.body, { message: "Storage limit reached" });
      assert.equal(stored(edited).revision, 2);
      assert.equal(stored(edited).content, small.value.content);
      const storageReads = state.reads.filter((read) => read.op === "find");
      assert.equal(hex(storageReads.at(-1).filter.owner), hex(users.owner._id));
    });
  });

  describe("delete", () => {
    it("lets the owner delete and calls cleanup", async () => {
      const diagram = addDiagram(users.owner, { members: [member(users.editor, "editor")] });
      const response = await call(users.owner, "DELETE", `/${ID_A}`);
      assert.equal(response.status, 204);
      assert.equal(response.body, null);
      assert.equal(state.diagrams.has(hex(diagram._id)), false);
      assert.equal(state.deletes.length, 1);
      assert.equal(hex(state.deletes[0]._id), hex(diagram._id));
      assert.equal(hex(state.deletes[0].owner), hex(users.owner._id));
      assert.equal(state.updateMany.length, 0);
    });

    it("rejects an editor and a viewer", async () => {
      const diagram = addDiagram(users.owner, {
        members: [member(users.editor, "editor"), member(users.viewer, "viewer")],
      });
      for (const user of [users.editor, users.viewer]) {
        const response = await call(user, "DELETE", `/${ID_A}`);
        assert.equal(response.status, 403);
        assert.deepEqual(response.body, { message: "Only the owner can delete this diagram" });
      }
      assert.equal(state.deletes.length, 0);
      assert.equal(state.diagrams.has(hex(diagram._id)), true);
    });

    it("answers 404 with the same body for a stranger and a malformed id", async () => {
      addDiagram(users.owner);
      const stranger = await call(users.outsider, "DELETE", `/${ID_A}`);
      const readsAfter = state.reads.length;
      const malformed = await call(users.owner, "DELETE", "/nope");
      assert.equal(stranger.status, 404);
      assert.deepEqual(stranger.body, { message: "Diagram not found" });
      assert.deepEqual(malformed.body, stranger.body);
      assert.equal(state.reads.length, readsAfter);
      assert.equal(state.deletes.length, 0);
    });
  });

  describe("deleteUserDiagramData", () => {
    it("deletes owned diagrams and pulls memberships", async () => {
      const owned = addDiagram(users.owner, { diagramId: ID_A, members: [member(users.editor, "editor")] });
      const shared = addDiagram(users.editor, {
        diagramId: ID_B,
        members: [member(users.owner, "viewer"), member(users.viewer, "editor")],
      });
      const unrelated = addDiagram(users.viewer, { diagramId: ID_C });

      await deleteUserDiagramData(users.owner);

      assert.equal(state.reads[0].op, "find");
      assert.deepEqual(Object.keys(state.reads[0].filter), ["owner"]);
      assert.equal(hex(state.reads[0].filter.owner), hex(users.owner._id));
      assert.equal(state.reads[0].select, "_id owner");
      assert.equal(state.deletes.length, 1);
      assert.equal(hex(state.deletes[0]._id), hex(owned._id));
      assert.equal(hex(state.deletes[0].owner), hex(users.owner._id));
      assert.equal(state.diagrams.has(hex(owned._id)), false);
      assert.equal(state.updateMany.length, 1);
      assert.equal(hex(state.updateMany[0].filter["members.user"]), hex(users.owner._id));
      assert.equal(hex(state.updateMany[0].update.$pull.members.user), hex(users.owner._id));
      assert.deepEqual(stored(shared).members.map((entry) => hex(entry.user)), [hex(users.viewer._id)]);
      assert.equal(stored(unrelated).members.length, 0);
      assert.equal(state.diagrams.has(hex(unrelated._id)), true);
    });
  });

  it("exposes one public share route and no protectRoute", () => {
    const paths = shareRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
    assert.deepEqual(paths, ["get /:shareId"]);
    assert.equal(shareRouter.stack.some((layer) => layer.handle?.name === "protectRoute"), false);
  });

  describe("versions", () => {
    function withMembers() {
      return addDiagram(users.owner, {
        members: [member(users.editor, "editor"), member(users.viewer, "viewer")],
      });
    }

    it("records a version for the owner and an editor", async () => {
      const diagram = withMembers();
      const payloads = [
        [users.owner, '{ "tables" : [ ] , "by" : "owner" }'],
        [users.editor, '{ "tables" : [ { "name" : "users" } ] , "label" : "café" }'],
      ];
      for (const [user, raw] of payloads) {
        const expected = parseSnapshotContent(raw);
        const response = await call(user, "POST", `/${ID_A}/versions`, { content: raw, ignored: true });
        assert.equal(response.status, 201, user.fullName);
        assert.equal(response.body.recorded, true);
        assert.match(response.body.version.version, /^[0-9a-f]{40}$/);
        assert.equal(
          response.body.version.committed_at,
          new Date(response.body.version.committed_at).toISOString(),
        );
        const row = [...state.versions.values()].find((item) => item.versionId === response.body.version.version);
        assert.equal(response.body.version.committed_at, row.createdAt.toISOString());
        assert.equal(response.body.version.sizeBytes, expected.value.sizeBytes);
        assert.equal(hex(row.diagram), hex(diagram._id));
        assert.equal(hex(row.owner), hex(users.owner._id));
        assert.equal(hex(row.recordedBy), hex(user._id));
        assert.equal(row.content, expected.value.content);
        assert.equal(row.contentHash, expected.value.contentHash);
      }
    });

    it("skips an unchanged snapshot and does not read storage", async () => {
      const diagram = withMembers();
      addVersion(diagram, {
        versionId: versionIdFor(1),
        content: JSON.stringify({ tables: [], label: "old" }),
      });
      const newest = addVersion(diagram, {
        versionId: versionIdFor(2),
        content: JSON.stringify({ tables: [], label: "café" }),
      });
      const response = await call(users.owner, "POST", `/${ID_A}/versions`, {
        content: '{ "tables" : [ ] , "label" : "café" }',
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.recorded, false);
      assert.deepEqual(response.body.version, {
        version: newest.versionId,
        committed_at: newest.createdAt.toISOString(),
        sizeBytes: newest.sizeBytes,
      });
      assert.equal(state.versionCreates.length, 0);
      assert.equal(state.reads.some((read) => read.select === "sizeBytes"), false);
      assert.equal(state.versionReads.some((read) => read.select === "sizeBytes"), false);
      assert.equal(state.shareReads.length, 0);
    });

    it("rejects a viewer, a stranger, a bad diagram id, and bad snapshot content", async () => {
      withMembers();
      const viewer = await call(users.viewer, "POST", `/${ID_A}/versions`, { content: "{\"tables\":[]}" });
      assert.equal(viewer.status, 403);
      assert.deepEqual(viewer.body, { message: "You can only view this diagram" });
      assert.equal(state.versionReads.length, 0);

      const stranger = await call(users.outsider, "POST", `/${ID_A}/versions`, { content: "{\"tables\":[]}" });
      const malformed = await call(users.owner, "POST", "/not-a-uuid/versions", { content: "{\"tables\":[]}" });
      assert.equal(stranger.status, 404);
      assert.equal(malformed.status, 404);
      assert.deepEqual(stranger.body, { message: "Diagram not found" });
      assert.deepEqual(malformed.body, stranger.body);
      assert.equal(state.versionReads.length, 0);

      const cases = [
        [1, 400, "Snapshot content must be text"],
        [null, 400, "Snapshot content must be text"],
        ["[]", 400, "Snapshot content must be a JSON object"],
        ["null", 400, "Snapshot content must be a JSON object"],
        ['"text"', 400, "Snapshot content must be a JSON object"],
        ["{bad", 400, "Snapshot content must be a JSON object"],
        ["{}", 400, "Snapshot content must have a tables list"],
        ['{"tables":{}}', 400, "Snapshot content must have a tables list"],
      ];
      for (const [content, status, message] of cases) {
        const response = await call(users.owner, "POST", `/${ID_A}/versions`, { content });
        assert.equal(response.status, status, message);
        assert.deepEqual(response.body, { message });
      }
      assert.equal(state.versionReads.length, 0);
      assert.equal(state.versionCreates.length, 0);

      const overhead = Buffer.byteLength('{"tables":[],"pad":""}', "utf8");
      const over = `{"tables":[],"pad":"${"x".repeat(MAX_DIAGRAM_BYTES - overhead + 1)}"}`;
      assert.equal(Buffer.byteLength(over, "utf8"), MAX_DIAGRAM_BYTES + 1);
      const tooBig = await call(users.owner, "POST", `/${ID_A}/versions`, { content: over });
      assert.equal(tooBig.status, 413);
      assert.deepEqual(tooBig.body, { message: "Diagram is too large" });
      assert.equal(state.versionReads.length, 0);
      assert.equal(state.versionCreates.length, 0);
    });

    it("drops the oldest version when a diagram already has 20", async () => {
      const diagram = withMembers();
      const seeded = [];
      for (let n = 0; n < 20; n += 1) {
        seeded.push(addVersion(diagram, {
          versionId: versionIdFor(n),
          content: JSON.stringify({ tables: [], n }),
        }));
      }
      const oldest = seeded[0];
      const response = await call(users.owner, "POST", `/${ID_A}/versions`, {
        content: JSON.stringify({ tables: [], fresh: true }),
      });
      assert.equal(response.status, 201);
      assert.equal(state.versions.size, 20);
      assert.equal(state.versions.has(hex(oldest._id)), false);
      assert.equal(state.versionDeletes.length, 1);
      assert.equal(hex(state.versionDeletes[0].diagram), hex(diagram._id));
      assert.equal(state.versionDeletes[0]._id.$in.length, 1);
      assert.equal(hex(state.versionDeletes[0]._id.$in[0]), hex(oldest._id));
    });

    it("counts diagrams, versions, and shares toward the owner quota", async () => {
      const content = JSON.stringify({ tables: [], quota: "record" });
      const parsed = parseSnapshotContent(content);
      const bytes = parsed.value.sizeBytes;
      const versionBytes = 80;
      const shareBytes = 80;
      const diagramBytes = MAX_STORAGE_BYTES + 1 - versionBytes - shareBytes - bytes;
      assert.equal(fitsStorage(diagramBytes + versionBytes + shareBytes + bytes), false);
      assert.equal(fitsStorage(diagramBytes + shareBytes + bytes), true);
      assert.equal(fitsStorage(diagramBytes + versionBytes + bytes), true);
      assert.equal(fitsStorage(diagramBytes + bytes), true);

      const diagram = addDiagram(users.owner, {
        sizeBytes: diagramBytes,
        members: [member(users.editor, "editor")],
      });
      addVersion(diagram, {
        sizeBytes: versionBytes,
        content: JSON.stringify({ tables: [], seed: "version" }),
      });
      addShare(diagram, {
        sizeBytes: shareBytes,
        content: JSON.stringify({ tables: [], seed: "share" }),
      });

      const blocked = await call(users.editor, "POST", `/${ID_A}/versions`, { content });
      assert.equal(blocked.status, 413);
      assert.deepEqual(blocked.body, { message: "Storage limit reached" });
      assert.equal(state.versionCreates.length, 0);

      stored(diagram).sizeBytes = diagramBytes - 1;
      const allowed = await call(users.editor, "POST", `/${ID_A}/versions`, { content });
      assert.equal(allowed.status, 201);
      assert.equal(allowed.body.recorded, true);
      const created = state.versionCreates[0];
      assert.equal(hex(created.owner), hex(users.owner._id));
      assert.equal(hex(created.recordedBy), hex(users.editor._id));
      const charged = state.reads.filter((read) => read.select === "sizeBytes");
      assert.ok(charged.length >= 1);
      assert.ok(charged.every((read) => hex(read.filter.owner) === hex(users.owner._id)));
    });

    it("lists versions newest first for every role", async () => {
      const diagram = withMembers();
      const seeded = [];
      for (let n = 0; n < 25; n += 1) {
        seeded.push(addVersion(diagram, {
          versionId: versionIdFor(n),
          content: JSON.stringify({ tables: [], note: `SECRET_VERSION_${n}` }),
        }));
      }
      const other = addDiagram(users.owner, { diagramId: ID_B });
      const foreign = addVersion(other, {
        versionId: versionIdFor(100),
        content: JSON.stringify({ tables: [], note: "SECRET_VERSION_FOREIGN" }),
      });
      const newestFirst = [...seeded].reverse();

      const viewer = await call(users.viewer, "GET", `/${ID_A}/versions`);
      assert.equal(viewer.status, 200);
      const first = await call(users.owner, "GET", `/${ID_A}/versions`);
      assert.equal(first.status, 200);
      assert.deepEqual(first.body.data.map((item) => item.version), newestFirst.slice(0, 10).map((row) => row.versionId));
      assert.equal(first.body.data[0].committed_at, newestFirst[0].createdAt.toISOString());
      assert.deepEqual(Object.keys(first.body.data[0]).sort(), ["committed_at", "sizeBytes", "version"]);
      assert.equal(first.body.pagination.limit, 10);
      assert.equal(first.body.pagination.count, 10);
      assert.equal(first.body.pagination.hasMore, true);
      assert.equal(first.body.pagination.cursor, newestFirst[9].versionId);
      assert.equal(JSON.stringify(first.body).includes("SECRET_VERSION"), false);
      assert.equal(viewer.body.data[0].version, first.body.data[0].version);

      const second = await call(users.owner, "GET", `/${ID_A}/versions?cursor=${first.body.pagination.cursor}`);
      assert.deepEqual(second.body.data.map((item) => item.version), newestFirst.slice(10, 20).map((row) => row.versionId));
      const third = await call(users.owner, "GET", `/${ID_A}/versions?cursor=${second.body.pagination.cursor}`);
      assert.deepEqual(third.body.data.map((item) => item.version), newestFirst.slice(20).map((row) => row.versionId));
      assert.equal(third.body.pagination.hasMore, false);
      assert.equal(third.body.pagination.cursor, null);
      const seen = [...first.body.data, ...second.body.data, ...third.body.data].map((item) => item.version);
      assert.equal(seen.includes(foreign.versionId), false);
      assert.equal(seen.length, 25);

      for (const [query, message] of [
        ["?limit=21", "Invalid limit"],
        ["?limit=0", "Invalid limit"],
        ["?cursor=zzz", "Invalid cursor"],
      ]) {
        const response = await call(users.owner, "GET", `/${ID_A}/versions${query}`);
        assert.equal(response.status, 400, query);
        assert.deepEqual(response.body, { message });
      }
      const meta = state.versionReads.filter((read) => read.op === "find" && read.select === "-content");
      assert.ok(meta.length >= 1);
      assert.equal(hex(meta[0].filter.diagram), hex(diagram._id));
      assert.deepEqual(meta[0].sort, { createdAt: -1, _id: -1 });
    });

    it("reads one version and hides another diagram's version", async () => {
      const diagram = withMembers();
      const version = addVersion(diagram, {
        versionId: versionIdFor(3),
        content: JSON.stringify({ tables: [], visible: true }),
      });
      const other = addDiagram(users.owner, { diagramId: ID_B });
      const foreign = addVersion(other, { versionId: versionIdFor(4) });
      const expected = {
        data: {
          id: version.versionId,
          committed_at: version.createdAt.toISOString(),
          files: {
            "versionned.json": {
              filename: "versionned.json",
              size: version.sizeBytes,
              content: version.content,
            },
          },
        },
      };
      for (const user of [users.owner, users.editor, users.viewer]) {
        const response = await call(user, "GET", `/${ID_A}/versions/${version.versionId}`);
        assert.equal(response.status, 200, user.fullName);
        assert.deepEqual(response.body, expected);
      }
      const hidden = await call(users.owner, "GET", `/${ID_A}/versions/${foreign.versionId}`);
      const unknown = await call(users.owner, "GET", `/${ID_A}/versions/${"d".repeat(40)}`);
      const readsBefore = state.versionReads.filter((read) => read.op === "findOne").length;
      const malformed = await call(users.owner, "GET", `/${ID_A}/versions/${"AB".repeat(20)}`);
      assert.equal(hidden.status, 404);
      assert.equal(unknown.status, 404);
      assert.equal(malformed.status, 404);
      assert.deepEqual(hidden.body, { message: "Version not found" });
      assert.deepEqual(unknown.body, hidden.body);
      assert.deepEqual(malformed.body, hidden.body);
      assert.equal(state.versionReads.filter((read) => read.op === "findOne").length, readsBefore);
    });

    it("compares two versions, including the null sentinel, for a viewer", async () => {
      const diagram = withMembers();
      const older = addVersion(diagram, {
        versionId: versionIdFor(5),
        content: JSON.stringify({ tables: [], side: "a" }),
      });
      const newer = addVersion(diagram, {
        versionId: versionIdFor(6),
        content: JSON.stringify({ tables: [], side: "b" }),
      });
      const both = await call(
        users.viewer,
        "GET",
        `/${ID_A}/versions/${older.versionId}/compare/${newer.versionId}`,
      );
      assert.equal(both.status, 200);
      assert.deepEqual(both.body, { data: { contentA: older.content, contentB: newer.content } });

      const same = await call(
        users.owner,
        "GET",
        `/${ID_A}/versions/${older.versionId}/compare/${older.versionId}`,
      );
      assert.equal(same.status, 200);
      assert.equal(same.body.data.contentA, older.content);
      assert.equal(same.body.data.contentB, older.content);

      const open = await call(users.owner, "GET", `/${ID_A}/versions/${older.versionId}/compare/null`);
      assert.equal(open.status, 200);
      assert.deepEqual(open.body, { data: { contentA: older.content, contentB: "" } });

      for (const path of [
        `/${ID_A}/versions/${"e".repeat(40)}/compare/null`,
        `/${ID_A}/versions/not-an-id/compare/null`,
        `/${ID_A}/versions/${older.versionId}/compare/${"f".repeat(40)}`,
        `/${ID_A}/versions/${older.versionId}/compare/not-an-id`,
      ]) {
        const response = await call(users.owner, "GET", path);
        assert.equal(response.status, 404, path);
        assert.deepEqual(response.body, { message: "Version not found" });
      }
    });
  });

  describe("shares", () => {
    it("creates a share, refreshes it, and rejects a viewer or bad content", async () => {
      addDiagram(users.owner, {
        members: [member(users.editor, "editor"), member(users.viewer, "viewer")],
      });
      const firstBody = JSON.stringify({ tables: [], n: 1 });
      const first = await call(users.owner, "PUT", `/${ID_A}/share`, { content: firstBody, ignored: true });
      assert.equal(first.status, 201);
      assert.equal(first.body.created, true);
      assert.equal(first.body.shareId.length, 22);
      assert.equal(parseShareId(first.body.shareId), first.body.shareId);
      assert.equal(first.body.updatedAt, "2026-11-26T12:00:00.000Z");
      assert.equal(first.body.sizeBytes, parseSnapshotContent(firstBody).value.sizeBytes);

      const secondBody = '{ "tables" : [ ] , "n" : 2 }';
      const second = await call(users.editor, "PUT", `/${ID_A}/share`, { content: secondBody });
      assert.equal(second.status, 200);
      assert.equal(second.body.created, false);
      assert.equal(second.body.shareId, first.body.shareId);
      assert.equal(second.body.updatedAt, new Date(second.body.updatedAt).toISOString());
      const saved = [...state.shares.values()][0];
      assert.equal(saved.content, JSON.stringify({ tables: [], n: 2 }));
      assert.equal(saved.shareId, first.body.shareId);
      assert.equal(hex(saved.updatedBy), hex(users.editor._id));
      assert.equal(hex(saved.owner), hex(users.owner._id));

      const before = saved.content;
      const viewer = await call(users.viewer, "PUT", `/${ID_A}/share`, { content: "{\"tables\":[]}" });
      assert.equal(viewer.status, 403);
      assert.deepEqual(viewer.body, { message: "You can only view this diagram" });
      assert.equal([...state.shares.values()][0].content, before);

      const missingTables = await call(users.owner, "PUT", `/${ID_A}/share`, { content: "{}" });
      assert.equal(missingTables.status, 400);
      assert.deepEqual(missingTables.body, { message: "Snapshot content must have a tables list" });
      const overhead = Buffer.byteLength('{"tables":[],"pad":""}', "utf8");
      const over = `{"tables":[],"pad":"${"x".repeat(MAX_DIAGRAM_BYTES - overhead + 1)}"}`;
      const tooBig = await call(users.owner, "PUT", `/${ID_A}/share`, { content: over });
      assert.equal(tooBig.status, 413);
      assert.deepEqual(tooBig.body, { message: "Diagram is too large" });
    });

    it("counts a replaced share toward the quota and rejects a create of that size", async () => {
      const content = JSON.stringify({ tables: [], quota: true });
      const bytes = parseSnapshotContent(content).value.sizeBytes;
      addDiagram(users.owner, {
        sizeBytes: MAX_STORAGE_BYTES - bytes + 1,
        members: [member(users.editor, "editor")],
      });
      const blocked = await call(users.editor, "PUT", `/${ID_A}/share`, { content });
      assert.equal(blocked.status, 413);
      assert.deepEqual(blocked.body, { message: "Storage limit reached" });
      assert.equal(state.shares.size, 0);
      assert.equal(state.shareCreates.length, 0);

      state.diagrams.clear();
      const diagram = addDiagram(users.owner, {
        sizeBytes: MAX_STORAGE_BYTES - bytes,
        members: [member(users.editor, "editor")],
      });
      const existing = addShare(diagram, { sizeBytes: bytes, content });
      const refreshed = await call(users.editor, "PUT", `/${ID_A}/share`, { content });
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.body.created, false);
      assert.equal(refreshed.body.shareId, existing.shareId);
      const charged = state.reads.filter((read) => read.select === "sizeBytes").at(-1);
      assert.equal(hex(charged.filter.owner), hex(users.owner._id));
    });

    it("refreshes a share created by a parallel request", async () => {
      const diagram = addDiagram(users.owner, {
        members: [member(users.editor, "editor")],
      });
      const planted = {
        _id: newId(),
        shareId: "Bc".repeat(11),
        diagram: diagram._id,
        owner: diagram.owner,
        updatedBy: users.outsider._id,
        content: "{\"tables\":[]}",
        sizeBytes: 12,
        createdAt: new Date("2026-11-26T01:00:00.000Z"),
        updatedAt: new Date("2026-11-26T01:00:00.000Z"),
      };
      state.shareCreateConflict = planted;
      const response = await call(users.editor, "PUT", `/${ID_A}/share`, {
        content: JSON.stringify({ tables: [], raced: true }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.created, false);
      assert.equal(response.body.shareId, planted.shareId);
      const saved = state.shares.get(hex(planted._id));
      assert.equal(saved.content, JSON.stringify({ tables: [], raced: true }));
      assert.equal(hex(saved.updatedBy), hex(users.editor._id));
      assert.equal(state.shares.size, 1);
    });

    it("deletes a share for the owner and an editor, and repeats", async () => {
      const diagram = addDiagram(users.owner, {
        members: [member(users.editor, "editor"), member(users.viewer, "viewer")],
      });
      const first = addShare(diagram);
      const ownerDelete = await call(users.owner, "DELETE", `/${ID_A}/share`);
      assert.equal(ownerDelete.status, 204);
      assert.equal(ownerDelete.body, null);
      assert.equal(state.shares.has(hex(first._id)), false);
      const again = await call(users.owner, "DELETE", `/${ID_A}/share`);
      assert.equal(again.status, 204);

      const second = addShare(diagram, { shareId: "e".repeat(22) });
      const editorDelete = await call(users.editor, "DELETE", `/${ID_A}/share`);
      assert.equal(editorDelete.status, 204);
      assert.equal(state.shares.has(hex(second._id)), false);

      const kept = addShare(diagram, { shareId: "f".repeat(22) });
      const viewerDelete = await call(users.viewer, "DELETE", `/${ID_A}/share`);
      assert.equal(viewerDelete.status, 403);
      assert.deepEqual(viewerDelete.body, { message: "You can only view this diagram" });
      assert.equal(state.shares.has(hex(kept._id)), true);
    });

    it("reads a share with no session and does not cache it", async () => {
      const diagram = addDiagram(users.owner);
      const share = addShare(diagram, {
        content: JSON.stringify({ tables: [], shared: true }),
      });
      const beforeUsers = state.userFindOnes.length;
      const response = await callShare(`/${share.shareId}`);
      assert.equal(response.status, 200);
      assert.equal(response.cacheControl, "no-store");
      assert.equal(state.userFindOnes.length, beforeUsers);
      assert.deepEqual(response.body, {
        data: {
          id: share.shareId,
          updated_at: share.updatedAt.toISOString(),
          files: {
            "share.json": {
              filename: "share.json",
              size: share.sizeBytes,
              content: share.content,
            },
          },
        },
      });

      const unknown = await callShare(`/${"u".repeat(22)}`);
      assert.equal(unknown.status, 404);
      assert.deepEqual(unknown.body, { message: "Share not found" });
      const readsBefore = state.shareReads.filter((read) => read.op === "findOne").length;
      const malformed = await callShare(`/${encodeURIComponent(`${"u".repeat(21)}+`)}`);
      assert.equal(malformed.status, 404);
      assert.deepEqual(malformed.body, { message: "Share not found" });
      assert.equal(state.shareReads.filter((read) => read.op === "findOne").length, readsBefore);

      await call(users.owner, "DELETE", `/${ID_A}/share`);
      const removed = await callShare(`/${share.shareId}`);
      assert.equal(removed.status, 404);
      assert.deepEqual(removed.body, { message: "Share not found" });
    });
  });

  describe("snapshot cleanup", () => {
    it("deletes that diagram's versions and share before the diagram row", async () => {
      const diagram = addDiagram(users.owner, { members: [member(users.editor, "editor")] });
      const version = addVersion(diagram);
      const share = addShare(diagram);
      const other = addDiagram(users.editor, { diagramId: ID_B });
      const otherVersion = addVersion(other);
      const otherShare = addShare(other);

      const response = await call(users.owner, "DELETE", `/${ID_A}`);
      assert.equal(response.status, 204);
      assert.equal(state.versions.has(hex(version._id)), false);
      assert.equal(state.shares.has(hex(share._id)), false);
      assert.equal(state.versions.has(hex(otherVersion._id)), true);
      assert.equal(state.shares.has(hex(otherShare._id)), true);
      assert.equal(state.diagrams.has(hex(other._id)), true);
      assert.deepEqual(state.events, ["version.deleteMany", "share.deleteMany", "diagram.deleteOne"]);
      assert.equal(hex(state.versionDeletes[0].diagram), hex(diagram._id));
      assert.equal(filterKeys(state.versionDeletes[0]).join(","), "diagram");
      assert.equal(hex(state.shareDeletes[0].diagram), hex(diagram._id));
    });

    it("deletes versions and shares owned by a removed user, including orphans", async () => {
      const owned = addDiagram(users.owner, { diagramId: ID_A, members: [member(users.editor, "editor")] });
      const ownedVersion = addVersion(owned);
      const ownedShare = addShare(owned);
      const orphanVersion = addVersion(owned, { diagram: newId(), versionId: versionIdFor(70) });
      const orphanShare = addShare(owned, { diagram: newId(), shareId: "q".repeat(22) });
      const other = addDiagram(users.editor, { diagramId: ID_B });
      const otherVersion = addVersion(other);
      const otherShare = addShare(other);

      await deleteUserDiagramData(users.owner);

      assert.equal(state.versions.has(hex(ownedVersion._id)), false);
      assert.equal(state.shares.has(hex(ownedShare._id)), false);
      assert.equal(state.versions.has(hex(orphanVersion._id)), false);
      assert.equal(state.shares.has(hex(orphanShare._id)), false);
      assert.equal(state.versions.has(hex(otherVersion._id)), true);
      assert.equal(state.shares.has(hex(otherShare._id)), true);
      assert.equal(state.diagrams.has(hex(other._id)), true);
      assert.ok(state.versionDeletes.some((filter) => (
        filterKeys(filter).join(",") === "owner" && hex(filter.owner) === hex(users.owner._id)
      )));
      assert.ok(state.shareDeletes.some((filter) => (
        filterKeys(filter).join(",") === "owner" && hex(filter.owner) === hex(users.owner._id)
      )));
    });
  });
});
