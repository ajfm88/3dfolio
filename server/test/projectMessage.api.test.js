import assert from "node:assert/strict";
import http from "node:http";
import { after, afterEach, before, describe, it, mock } from "node:test";
import express from "express";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import Project from "../src/models/project.model.js";
import ProjectMessage from "../src/models/projectMessage.model.js";
import { deleteProject } from "../src/controllers/project.controller.js";
import { listProjectMessages, sendProjectMessage, setProjectMessageDeps } from "../src/controllers/projectMessage.controller.js";
import { io } from "../src/lib/socket.js";
import {
  MEDIA_NOT_CONFIGURED_MESSAGE,
  TEXT_OR_MEDIA_MESSAGE,
} from "../src/lib/projectMessages.js";
import { authorizeProjectChat, projectMediaUpload } from "../src/middleware/projectMessage.middleware.js";
import projectRouter from "../src/routes/project.route.js";

function id() {
  return new mongoose.Types.ObjectId().toString();
}

function projectDocument(projectId, userId, role) {
  if (role === "owner") return { _id: projectId, name: "Design", owner: userId, members: [] };
  return {
    _id: projectId,
    name: "Design",
    owner: id(),
    members: [{ user: userId, role }],
  };
}

function idOf(value) {
  if (value && typeof value.toHexString === "function") return value.toHexString();
  return String(value).toLowerCase();
}

function timeOf(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function matches(row, filter) {
  if (idOf(row.project) !== idOf(filter.project)) return false;
  if (filter.createdAt?.$lt) return timeOf(row.createdAt) < timeOf(filter.createdAt.$lt);
  if (Array.isArray(filter.$or)) {
    const [older, tie] = filter.$or;
    if (timeOf(row.createdAt) < timeOf(older.createdAt.$lt)) return true;
    return timeOf(row.createdAt) === timeOf(tie.createdAt) && idOf(row._id) < idOf(tie._id.$lt);
  }
  return true;
}

function byNewest(left, right) {
  const delta = timeOf(right.createdAt) - timeOf(left.createdAt);
  if (delta !== 0) return delta;
  const a = idOf(left._id);
  const b = idOf(right._id);
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

function messageRow(projectId, userId, overrides = {}) {
  const stamp = overrides.createdAt ?? new Date("2026-11-11T12:00:00.000Z");
  return {
    _id: overrides._id ?? id(),
    project: projectId,
    sender: {
      _id: userId,
      fullName: "Ada",
      img: "",
      email: "ada@example.com",
      clerkId: "clerk_secret",
    },
    text: overrides.text ?? "Hello",
    image: overrides.image ?? "",
    video: overrides.video ?? "",
    createdAt: stamp,
    updatedAt: overrides.updatedAt ?? stamp,
    __v: 0,
    ...overrides,
    project: projectId,
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  // protectRoute stays on the production router. This fixture only supplies
  // the Mongo user a signed-in request would already have.
  app.use((req, _res, next) => {
    const userId = req.headers["x-user-id"];
    if (typeof userId === "string" && userId) {
      req.user = { _id: userId, fullName: "Ada", img: "" };
    }
    next();
  });
  app.get("/api/projects/:id/messages", authorizeProjectChat, listProjectMessages);
  app.post("/api/projects/:id/messages", authorizeProjectChat, projectMediaUpload, sendProjectMessage);
  app.delete("/api/projects/:id", deleteProject);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ message: error.message || "Something went wrong!" });
  });
  return app;
}

async function request(base, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.userId) headers["x-user-id"] = options.userId;
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
  const body = await response.json();
  return { status: response.status, body };
}

describe("project message routes", { concurrency: false }, () => {
  const restores = [];
  let base;
  let server;
  let state;

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

  function world() {
    state = {
      access: true,
      configured: true,
      revokeOnUpload: false,
      uploadError: null,
      createError: null,
      deletedCount: 1,
      messageDeleteError: null,
      events: [],
      queries: [],
      created: [],
      deletes: [],
      emits: [],
      uploads: [],
      store: [],
      saved: null,
      members: new Map(),
      rooms: new Map(),
    };

    mock.method(Project, "findOne", (filter) => {
      state.events.push("member");
      const projectId = idOf(filter?._id);
      const clauses = Array.isArray(filter?.$or) ? filter.$or : [];
      const userId = idOf(clauses[0]?.owner ?? clauses[1]?.["members.user"]);
      return {
        lean() {
          if (!state.access) return Promise.resolve(null);
          if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(userId)) return Promise.resolve(null);
          const role = state.members.get(userId);
          if (!role) return Promise.resolve(null);
          return Promise.resolve(projectDocument(projectId, userId, role));
        },
      };
    });
    restores.push(() => Project.findOne.mock.restore());

    restores.push(setProjectMessageDeps({
      hasImageKitConfig: () => state.configured,
      uploadChatMedia: async (file, folder) => {
        state.events.push("upload");
        state.uploads.push({ folder, type: file.mimetype });
        if (state.revokeOnUpload) state.access = false;
        if (state.uploadError) throw state.uploadError;
        return "https://cdn.example/uploaded";
      },
    }));

    mock.method(ProjectMessage, "find", (filter) => {
      state.queries.push({ filter });
      let docs = state.store.filter((row) => matches(row, filter));
      const api = {
        sort(spec) {
          state.queries.at(-1).sort = spec;
          docs = docs.slice().sort(byNewest);
          return api;
        },
        limit(count) {
          state.queries.at(-1).limit = count;
          docs = docs.slice(0, count);
          return api;
        },
        populate(path, fields) {
          state.queries.at(-1).populate = { path, fields };
          return api;
        },
        lean() {
          return Promise.resolve(docs.map((row) => ({
            ...row,
            sender: row.sender ? { ...row.sender } : null,
          })));
        },
      };
      return api;
    });
    restores.push(() => ProjectMessage.find.mock.restore());

    mock.method(ProjectMessage, "create", async (doc) => {
      state.events.push("create");
      if (state.createError) throw state.createError;
      state.created.push(doc);
      state.saved = {
        _id: new mongoose.Types.ObjectId(),
        project: doc.project,
        sender: doc.sender,
        text: doc.text,
        image: doc.image ?? "",
        video: doc.video ?? "",
        createdAt: new Date("2026-11-11T12:00:02.000Z"),
        updatedAt: new Date("2026-11-11T12:00:02.000Z"),
      };
      return state.saved;
    });
    restores.push(() => ProjectMessage.create.mock.restore());

    mock.method(ProjectMessage, "findById", () => {
      state.events.push("read");
      const api = {
        populate() { return api; },
        lean() {
          if (!state.saved) return Promise.resolve(null);
          return Promise.resolve({
            ...state.saved,
            sender: {
              _id: state.saved.sender,
              fullName: "Ada",
              img: "",
              email: "ada@example.com",
              clerkId: "clerk_secret",
            },
            __v: 0,
          });
        },
      };
      return api;
    });
    restores.push(() => ProjectMessage.findById.mock.restore());

    mock.method(ProjectMessage, "deleteMany", async (filter) => {
      state.deletes.push({ model: "messages", filter });
      if (state.messageDeleteError) throw state.messageDeleteError;
      return { deletedCount: 2 };
    });
    restores.push(() => ProjectMessage.deleteMany.mock.restore());
    mock.method(Project, "deleteOne", async (filter) => {
      state.deletes.push({ model: "project", filter });
      return { deletedCount: state.deletedCount };
    });
    restores.push(() => Project.deleteOne.mock.restore());
    mock.method(Canvas, "deleteOne", async (filter) => {
      state.deletes.push({ model: "canvas", filter });
      return { deletedCount: 1 };
    });
    restores.push(() => Canvas.deleteOne.mock.restore());

    mock.method(io, "to", (room) => ({
      emit(event, payload) {
        state.events.push("emit");
        state.emits.push({ room, event, payload });
        for (const socket of state.rooms.get(room) ?? []) socket.received.push({ event, payload });
      },
    }));
    restores.push(() => io.to.mock.restore());
    return state;
  }

  function join(socket, room) {
    const members = state.rooms.get(room) ?? new Set();
    members.add(socket);
    state.rooms.set(room, members);
    socket.rooms.add(room);
  }

  it("registers history before upload and send on the production router", () => {
    const routes = projectRouter.stack.filter((layer) => layer.route?.path === "/:id/messages");
    const get = routes.find((layer) => layer.route.methods.get);
    const post = routes.find((layer) => layer.route.methods.post);
    assert.deepEqual(get.route.stack.map((layer) => layer.handle.name), [
      "authorizeProjectChat",
      "listProjectMessages",
    ]);
    assert.deepEqual(post.route.stack.map((layer) => layer.handle.name), [
      "authorizeProjectChat",
      "projectMediaUpload",
      "sendProjectMessage",
    ]);
  });

  it("returns history for every role and rejects outsiders before query errors", async () => {
    const current = world();
    const projectId = id();
    const ownerId = id();
    const editorId = id();
    const viewerId = id();
    const outsiderId = id();
    current.members.set(ownerId, "owner");
    current.members.set(editorId, "editor");
    current.members.set(viewerId, "viewer");
    const stamp = new Date("2026-11-11T12:00:00.000Z");
    current.store.push(
      messageRow(projectId, ownerId, { text: "inside", createdAt: stamp }),
      messageRow(id(), ownerId, { text: "other project", createdAt: stamp }),
    );

    for (const userId of [ownerId, editorId, viewerId]) {
      current.queries.length = 0;
      const response = await request(base, `/api/projects/${projectId}/messages`, { userId });
      assert.equal(response.status, 200);
      assert.equal(response.body.hasMore, false);
      assert.equal(response.body.nextCursor, null);
      assert.equal(response.body.messages.length, 1);
      assert.equal(response.body.messages[0].text, "inside");
      assert.equal(response.body.messages[0].sender.email, undefined);
      assert.equal(response.body.messages[0].sender.clerkId, undefined);
      assert.deepEqual(response.body.messages[0].sender, { _id: ownerId, fullName: "Ada", img: "" });
      assert.deepEqual(current.queries[0].sort, { createdAt: -1, _id: -1 });
      assert.equal(current.queries[0].limit, 51);
      assert.deepEqual(current.queries[0].populate, { path: "sender", fields: "_id fullName img" });
      assert.deepEqual(current.queries[0].filter, { project: projectId });
    }

    current.queries.length = 0;
    const outsider = await request(base, `/api/projects/${projectId}/messages?limit=nope`, { userId: outsiderId });
    assert.equal(outsider.status, 404);
    assert.deepEqual(outsider.body, { message: "Project not found" });
    assert.equal(current.queries.length, 0);

    const missing = await request(base, "/api/projects/not-an-id/messages?before=nope", { userId: ownerId });
    assert.equal(missing.status, 404);
    assert.equal(current.queries.length, 0);

    current.queries.length = 0;
    const emptyBefore = await request(base, `/api/projects/${projectId}/messages?before=`, { userId: ownerId });
    assert.equal(emptyBefore.status, 400);
    assert.deepEqual(emptyBefore.body, { message: "before must be a UTC timestamp" });
    assert.equal(current.queries.length, 0);
    const outsiderEmpty = await request(base, `/api/projects/${projectId}/messages?before=`, { userId: outsiderId });
    assert.equal(outsiderEmpty.status, 404);
    assert.deepEqual(outsiderEmpty.body, { message: "Project not found" });
    assert.equal(current.queries.length, 0);

    const badLimit = await request(base, `/api/projects/${projectId}/messages?limit=10abc`, { userId: ownerId });
    assert.equal(badLimit.status, 400);
    assert.equal(current.queries.length, 0);
    const repeated = await request(base, `/api/projects/${projectId}/messages?limit=1&limit=2`, { userId: ownerId });
    assert.equal(repeated.status, 400);
    // Express 5's simple parser stores "limit[a]" under its own key, so limit
    // is absent and the default page is used. An object limit value is rejected
    // by parseHistoryQuery; that case is covered in the helper suite.
    current.queries.length = 0;
    const nested = await request(base, `/api/projects/${projectId}/messages?limit[a]=1`, { userId: ownerId });
    assert.equal(nested.status, 200);
    assert.equal(nested.body.messages.length, 1);
    assert.equal(current.queries[0].limit, 51);
    current.queries.length = 0;
    const cursor = await request(base, `/api/projects/${projectId}/messages?beforeId=${id()}`, { userId: ownerId });
    assert.equal(cursor.status, 400);
    assert.equal(current.queries.length, 0);
  });

  it("pages identical timestamps once each, then older rows, including a message that arrives later", async () => {
    const current = world();
    const projectId = id();
    const userId = id();
    current.members.set(userId, "owner");
    const stamp = new Date("2026-11-11T12:00:00.000Z");
    const original = [];
    for (let index = 0; index < 60; index += 1) {
      const row = messageRow(projectId, userId, { text: `same-${index}`, createdAt: stamp, updatedAt: stamp });
      original.push(row._id);
      current.store.push(row);
    }
    const olderStamp = new Date("2026-11-11T11:00:00.000Z");
    const older = messageRow(projectId, userId, { text: "older", createdAt: olderStamp, updatedAt: olderStamp });
    current.store.push(older);

    const first = await request(base, `/api/projects/${projectId}/messages?limit=50`, { userId });
    assert.equal(first.status, 200);
    assert.equal(first.body.messages.length, 50);
    assert.equal(first.body.hasMore, true);
    assert.equal(first.body.messages[0].createdAt, stamp.toISOString());
    assert.ok(first.body.messages[0]._id < first.body.messages[49]._id);
    assert.deepEqual(current.queries[0].filter, { project: projectId });
    assert.equal(current.queries[0].limit, 51);

    const arrived = messageRow(projectId, userId, {
      text: "later",
      createdAt: new Date("2026-11-11T12:00:05.000Z"),
    });
    current.store.push(arrived);

    const cursor = first.body.nextCursor;
    const second = await request(
      base,
      `/api/projects/${projectId}/messages?limit=50&before=${encodeURIComponent(cursor.before)}&beforeId=${cursor.beforeId}`,
      { userId },
    );
    assert.equal(second.status, 200);
    assert.deepEqual(current.queries[1].filter, {
      project: projectId,
      $or: [
        { createdAt: { $lt: new Date(cursor.before) } },
        { createdAt: new Date(cursor.before), _id: { $lt: cursor.beforeId } },
      ],
    });
    assert.equal(second.body.hasMore, false);
    assert.equal(second.body.nextCursor, null);
    const seen = [...first.body.messages, ...second.body.messages].map((row) => row._id);
    assert.equal(new Set(seen).size, seen.length);
    assert.deepEqual(new Set(seen), new Set([...original, older._id]));
    assert.equal(seen.includes(arrived._id), false);

    current.queries.length = 0;
    const timestampOnly = await request(
      base,
      `/api/projects/${projectId}/messages?before=${encodeURIComponent(stamp.toISOString())}`,
      { userId },
    );
    assert.equal(timestampOnly.status, 200);
    assert.deepEqual(current.queries[0].filter, {
      project: projectId,
      createdAt: { $lt: stamp },
    });
    assert.deepEqual(timestampOnly.body.messages.map((row) => row._id), [older._id]);

    current.store.length = 0;
    const empty = await request(base, `/api/projects/${projectId}/messages`, { userId });
    assert.deepEqual(empty.body, { messages: [], hasMore: false, nextCursor: null });
    assert.equal(current.queries.at(-1).limit, 51);
  });

  it("sends json and media for a viewer, ignores forged fields, and broadcasts only to that project room", async () => {
    const current = world();
    const projectId = id();
    const otherProject = id();
    const userId = id();
    const forgedUser = id();
    current.members.set(userId, "viewer");
    const sender = { received: [], rooms: new Set([userId]) };
    const otherTab = { received: [], rooms: new Set([userId]) };
    const teammate = { received: [], rooms: new Set() };
    const elsewhere = { received: [], rooms: new Set() };
    const directOnly = { received: [], rooms: new Set([userId]) };
    join(sender, `project:${projectId}`);
    join(otherTab, `project:${projectId}`);
    join(teammate, `project:${projectId}`);
    join(elsewhere, `project:${otherProject}`);
    join(directOnly, userId);

    const sent = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "  hello\nthere  ",
        _id: forgedUser,
        project: otherProject,
        sender: forgedUser,
        image: "https://evil.example/a.png",
        video: "https://evil.example/a.mp4",
        email: "ada@example.com",
      }),
    });
    assert.equal(sent.status, 201);
    assert.equal(current.uploads.length, 0);
    assert.equal(current.created.length, 1);
    assert.equal(String(current.created[0].project), projectId);
    assert.equal(String(current.created[0].sender), userId);
    assert.equal(current.created[0].text, "hello\nthere");
    assert.equal(current.created[0].image, "");
    assert.equal(current.created[0].video, "");
    assert.equal(current.created[0]._id, undefined);
    assert.deepEqual(current.events.filter((event) => event !== "member"), ["create", "read", "emit"]);
    assert.equal(current.emits.length, 1);
    assert.equal(current.emits[0].room, `project:${projectId}`);
    assert.equal(current.emits[0].event, "project:message");
    assert.equal(current.emits[0].payload.projectId, projectId);
    assert.deepEqual(sent.body.message, current.emits[0].payload.message);
    assert.equal(sent.body.message.sender.email, undefined);
    assert.deepEqual(sent.body.message.sender, { _id: userId, fullName: "Ada", img: "" });
    for (const socket of [sender, otherTab, teammate]) {
      assert.equal(socket.received.length, 1);
      assert.deepEqual(socket.received[0].payload.message, sent.body.message);
    }
    assert.equal(elsewhere.received.length, 0);
    assert.equal(directOnly.received.length, 0);

    const direct = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    current.emits.length = 0;
    await sendProjectMessage({
      body: { text: "direct" },
      file: null,
      user: { _id: userId, fullName: "Ada", img: "" },
      projectChat: { project: projectDocument(projectId, userId, "viewer"), role: "viewer" },
    }, direct);
    assert.equal(direct.statusCode, 201);
    assert.equal(direct.body.message, current.emits.at(-1).payload.message);
  });

  it("uploads one collaborate file after text is valid and refuses bad, empty, or unconfigured sends", async () => {
    const current = world();
    const projectId = id();
    const userId = id();
    current.members.set(userId, "editor");

    const empty = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.message, TEXT_OR_MEDIA_MESSAGE);
    assert.equal(current.uploads.length, 0);
    assert.equal(current.created.length, 0);
    assert.equal(current.emits.length, 0);

    const typed = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: 12 }),
    });
    assert.equal(typed.status, 400);
    assert.equal(current.uploads.length, 0);

    for (const [name, type] of [["shot.png", "image/png"], ["clip.mp4", "video/mp4"]]) {
      current.created.length = 0;
      current.uploads.length = 0;
      const form = new FormData();
      form.set("text", " with media ");
      form.set("image", "https://evil.example/nope");
      form.set("media", new Blob(["bytes"], { type }), name);
      const response = await request(base, `/api/projects/${projectId}/messages`, {
        method: "POST",
        userId,
        body: form,
      });
      assert.equal(response.status, 201, response.body.message);
      assert.equal(current.uploads[0].folder, "/collaborate");
      assert.equal(current.uploads[0].type, type);
      assert.equal(current.created[0].text, "with media");
      if (type.startsWith("video/")) {
        assert.equal(current.created[0].video, "https://cdn.example/uploaded");
        assert.equal(current.created[0].image, "");
      } else {
        assert.equal(current.created[0].image, "https://cdn.example/uploaded");
        assert.equal(current.created[0].video, "");
      }
      assert.ok(current.events.indexOf("member") < current.events.indexOf("upload"));
      assert.ok(current.events.indexOf("upload") < current.events.lastIndexOf("member"));
    }

    current.events.length = 0;
    current.uploads.length = 0;
    const duplicate = new FormData();
    duplicate.append("text", "one");
    duplicate.append("text", "two");
    duplicate.set("media", new Blob(["x"], { type: "image/png" }), "a.png");
    const duplicated = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: duplicate,
    });
    assert.equal(duplicated.status, 400);
    assert.equal(current.uploads.length, 0);
    assert.equal(current.events.includes("upload"), false);

    const savedBeforeFailure = current.created.length;
    const emitsBeforeFailure = current.emits.length;
    const uploadsBeforeFailure = current.uploads.length;
    current.configured = false;
    const offline = new FormData();
    offline.set("media", new Blob(["x"], { type: "image/png" }), "a.png");
    const unavailable = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: offline,
    });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.message, MEDIA_NOT_CONFIGURED_MESSAGE);
    assert.equal(current.uploads.length, uploadsBeforeFailure);
    assert.equal(current.created.length, savedBeforeFailure);
    assert.equal(current.emits.length, emitsBeforeFailure);

    current.configured = true;
    current.uploadError = new Error("upload failed");
    const broken = new FormData();
    broken.set("text", "caption");
    broken.set("media", new Blob(["x"], { type: "image/png" }), "a.png");
    const failedUpload = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: broken,
    });
    assert.equal(failedUpload.status, 500);
    assert.equal(current.created.length, savedBeforeFailure);
    assert.equal(current.emits.length, emitsBeforeFailure);

    current.uploadError = null;
    current.createError = new Error("save failed");
    const unsaved = new FormData();
    unsaved.set("text", "caption");
    unsaved.set("media", new Blob(["x"], { type: "image/png" }), "a.png");
    const failedSave = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: unsaved,
    });
    assert.equal(failedSave.status, 500);
    assert.equal(current.emits.length, emitsBeforeFailure);

    current.createError = null;
    current.revokeOnUpload = true;
    const revoked = new FormData();
    revoked.set("media", new Blob(["x"], { type: "image/png" }), "a.png");
    const lost = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: revoked,
    });
    assert.equal(lost.status, 404);
    assert.equal(current.created.length, savedBeforeFailure);
    assert.equal(current.emits.length, emitsBeforeFailure);

    const uploadsBeforeOutsider = current.uploads.length;
    current.access = false;
    current.revokeOnUpload = false;
    const outside = new FormData();
    outside.set("media", new Blob(["x"], { type: "text/plain" }), "notes.txt");
    const hidden = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: outside,
    });
    assert.equal(hidden.status, 404);
    assert.equal(current.uploads.length, uploadsBeforeOutsider);
  });

  it("maps real upload rejections to 400 and does not save them", async () => {
    const current = world();
    const projectId = id();
    const userId = id();
    current.members.set(userId, "owner");
    const before = current.created.length;

    const wrongField = new FormData();
    wrongField.set("file", new Blob(["x"], { type: "image/png" }), "a.png");
    const wrong = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: wrongField,
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.message, "Unexpected file field");

    const many = new FormData();
    many.append("media", new Blob(["a"], { type: "image/png" }), "a.png");
    many.append("media", new Blob(["b"], { type: "image/png" }), "b.png");
    const multiple = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: many,
    });
    assert.equal(multiple.status, 400);
    assert.equal(multiple.body.message, "Unexpected file field");

    const mime = new FormData();
    mime.set("media", new Blob(["hello"], { type: "text/plain" }), "notes.txt");
    const unsupported = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: mime,
    });
    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.message, "Only image and video uploads are allowed");

    const huge = new FormData();
    huge.set("media", new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: "image/png" }), "big.png");
    const oversized = await request(base, `/api/projects/${projectId}/messages`, {
      method: "POST",
      userId,
      body: huge,
    });
    assert.equal(oversized.status, 400);
    assert.equal(oversized.body.message, "File too large");
    assert.equal(current.created.length, before);
    assert.equal(current.uploads.length, 0);
    assert.equal(current.emits.length, 0);
  });

  it("deletes messages only after the owner delete succeeds", async () => {
    const current = world();
    const projectId = id();
    const ownerId = id();
    const editorId = id();
    const outsiderId = id();
    current.members.set(ownerId, "owner");
    current.members.set(editorId, "editor");

    const editor = await request(base, `/api/projects/${projectId}`, { method: "DELETE", userId: editorId });
    assert.equal(editor.status, 403);
    const outsider = await request(base, `/api/projects/${projectId}`, { method: "DELETE", userId: outsiderId });
    assert.equal(outsider.status, 404);
    const missing = await request(base, "/api/projects/not-an-id", { method: "DELETE", userId: ownerId });
    assert.equal(missing.status, 404);
    assert.equal(current.deletes.length, 0);

    current.deletedCount = 0;
    const raced = await request(base, `/api/projects/${projectId}`, { method: "DELETE", userId: ownerId });
    assert.equal(raced.status, 404);
    assert.deepEqual(current.deletes.map((entry) => entry.model), ["project"]);

    current.deletes.length = 0;
    current.deletedCount = 1;
    current.messageDeleteError = new Error("cleanup failed");
    const cleanup = await request(base, `/api/projects/${projectId}`, { method: "DELETE", userId: ownerId });
    assert.equal(cleanup.status, 500);
    assert.notEqual(cleanup.status, 200);
    assert.deepEqual(current.deletes.map((entry) => entry.model), ["project", "canvas", "messages"]);

    current.deletes.length = 0;
    current.messageDeleteError = null;
    const removed = await request(base, `/api/projects/${projectId}`, { method: "DELETE", userId: ownerId });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body, { message: "Project deleted" });
    assert.deepEqual(current.deletes.map((entry) => entry.model), ["project", "canvas", "messages"]);
    assert.deepEqual(current.deletes[2].filter, { project: projectId });
    assert.equal(current.deletes[0].filter.owner, ownerId);
  });
});
