import assert from "node:assert/strict";
import http from "node:http";
import { after, afterEach, before, describe, it, mock } from "node:test";
import express from "express";
import mongoose from "mongoose";

import Canvas from "../src/models/canvas.model.js";
import Project from "../src/models/project.model.js";
import ProjectMessage from "../src/models/projectMessage.model.js";
import User from "../src/models/user.model.js";
import projectRouter from "../src/routes/project.route.js";

// The production router, protectRoute and handlers run unchanged. Only the
// models are replaced, by an in-memory store that EVALUATES the filters and
// updates the handlers send (it throws on any operator it does not know), so a
// guard that would not match in MongoDB does not match here either. It is not a
// MongoDB concurrency test: it is single-threaded, and a stale read is staged
// explicitly with the barrier below. No live race test is claimed.

const CLERK_BRAND = Symbol.for("@clerk/express.auth");
const newId = () => new mongoose.Types.ObjectId();
const hex = (value) => (value && typeof value.toHexString === "function" ? value.toHexString() : String(value).toLowerCase());
const time = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

function same(a, b) {
  if (a instanceof Date || b instanceof Date) return time(a) === time(b);
  if (a && typeof a === "object" && typeof a.toHexString === "function") return hex(a) === hex(b);
  if (b && typeof b === "object" && typeof b.toHexString === "function") return hex(a) === hex(b);
  return a === b;
}

function subsetMatches(element, condition) {
  return Object.entries(condition).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date) && typeof value.toHexString !== "function") {
      throw new Error(`unsupported element condition on ${key}`);
    }
    return same(element[key], value);
  });
}

function arrayCondition(list, condition) {
  return Object.entries(condition).every(([operator, value]) => {
    if (operator === "$size") return list.length === value;
    if (operator === "$elemMatch") return list.some((element) => subsetMatches(element, value));
    if (operator === "$all") {
      return value.every((clause) => {
        if (!clause.$elemMatch) throw new Error("unsupported $all clause");
        return list.some((element) => subsetMatches(element, clause.$elemMatch));
      });
    }
    throw new Error(`unsupported array operator ${operator}`);
  });
}

function matchDoc(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$and") return value.every((part) => matchDoc(doc, part));
    if (key === "$or") return value.some((part) => matchDoc(doc, part));
    if (key === "_id") return same(doc._id, value);
    if (key === "owner") {
      if (value && value.$ne !== undefined) return !same(doc.owner, value.$ne);
      return same(doc.owner, value);
    }
    if (key === "members.user") {
      if (value && value.$ne !== undefined) return !doc.members.some((member) => same(member.user, value.$ne));
      return doc.members.some((member) => same(member.user, value));
    }
    if (key === "invites.email") return doc.invites.some((invite) => invite.email === value);
    if (key === "members") return arrayCondition(doc.members, value);
    if (key === "invites") return arrayCondition(doc.invites, value);
    throw new Error(`unsupported filter key ${key}`);
  });
}

// structuredClone would strip the ObjectId and Date prototypes that a real
// lean() read keeps, and roleOf relies on them.
function clone(value) {
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(value.toHexString());
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function createApp() {
  const app = express();
  app.use(express.json());
  // Clerk's request shape: a branded req.auth() function. getAuth in the
  // production protectRoute reads exactly this.
  app.use((req, _res, next) => {
    const clerkId = req.headers["x-clerk-id"];
    req.auth = Object.assign(
      () => ({ userId: typeof clerkId === "string" && clerkId ? clerkId : null, tokenType: "session_token" }),
      { [CLERK_BRAND]: true },
    );
    next();
  });
  app.use("/api/projects", projectRouter);
  app.use((error, _req, res, _next) => {
    res.status(500).json({ message: error.message || "Something went wrong!" });
  });
  return app;
}

describe("project membership routes", { concurrency: false }, () => {
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

  function person(name, email, extra = {}) {
    const user = { _id: newId(), clerkId: `clerk_${name}`, email, fullName: name, img: `${name}.png`, role: "user", ...extra };
    state.users.set(hex(user._id), user);
    return user;
  }

  function invite(email, role, invitedBy, extra = {}) {
    return { _id: newId(), email, role, invitedBy: invitedBy._id, createdAt: new Date("2026-11-12T10:00:00.000Z"), ...extra };
  }

  function member(user, role) {
    return { user: user._id, role, addedAt: new Date("2026-11-10T09:00:00.000Z") };
  }

  function addProject(owner, extra = {}) {
    const doc = {
      _id: newId(),
      name: "Design",
      description: "",
      owner: owner._id,
      members: [],
      invites: [],
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
      ...extra,
    };
    state.projects.set(hex(doc._id), doc);
    return doc;
  }

  const current = (doc) => state.projects.get(hex(doc._id));

  // Waits for `need` project reads to have started, then releases them all, so
  // two requests decide from the same snapshot before either one writes.
  // With manual: true the reads stay held after `need` have arrived, so a test
  // can change the store (a rename, a competing write) between the read and the
  // write, then call release().
  function stageReads(need, { manual = false } = {}) {
    let release;
    let arrive;
    const gate = new Promise((resolve) => { release = resolve; });
    const arrived = new Promise((resolve) => { arrive = resolve; });
    state.barrier = { need, seen: 0, gate, release, arrive, manual };
    return { arrived, release };
  }

  function world() {
    state = {
      projects: new Map(),
      users: new Map(),
      barrier: null,
      writes: [],
      userLookups: [],
      userWrites: 0,
      writeError: null,
    };

    users = {
      owner: person("owner", "Owner@Example.com"),
      editor: person("editor", "editor@example.com"),
      viewer: person("viewer", "viewer@example.com"),
      outsider: person("outsider", "outsider@example.com"),
      invitee: person("invitee", "Invitee@Example.com"),
      admin: person("admin", "admin@example.com", { role: "admin" }),
    };

    mock.method(User, "findOne", (filter) => {
      const found = [...state.users.values()].find((user) => user.clerkId === filter.clerkId);
      return Promise.resolve(found ? { ...found } : null);
    });
    restores.push(() => User.findOne.mock.restore());

    mock.method(User, "find", (filter) => {
      state.userLookups.push(filter);
      const ids = (filter._id?.$in ?? []).map(hex);
      let fields = null;
      const api = {
        select(value) { fields = value.split(" "); return api; },
        lean() {
          const rows = [...state.users.values()]
            .filter((user) => ids.includes(hex(user._id)))
            .map((user) => (fields ? Object.fromEntries(fields.map((field) => [field, user[field]])) : { ...user }));
          return Promise.resolve(rows);
        },
      };
      return api;
    });
    restores.push(() => User.find.mock.restore());

    for (const method of ["create", "updateOne", "findOneAndUpdate", "deleteOne"]) {
      mock.method(User, method, () => {
        state.userWrites += 1;
        throw new Error("users are written only by the webhook");
      });
      restores.push(() => User[method].mock.restore());
    }

    function read(filter) {
      // The snapshot is taken now; the result is delivered when the barrier
      // opens, which is what makes it stale if another request writes first.
      const snapshot = [...state.projects.values()].filter((doc) => matchDoc(doc, filter)).map(clone);
      const barrier = state.barrier;
      let wait = Promise.resolve();
      if (barrier) {
        barrier.seen += 1;
        if (barrier.seen >= barrier.need) {
          state.barrier = null;
          if (barrier.manual) barrier.arrive();
          else barrier.release();
        }
        wait = barrier.gate;
      }
      return { snapshot, wait };
    }

    mock.method(Project, "findOne", (filter) => {
      const { snapshot, wait } = read(filter);
      const api = {
        select() { return api; },
        lean() { return wait.then(() => snapshot[0] ?? null); },
      };
      return api;
    });
    restores.push(() => Project.findOne.mock.restore());

    mock.method(Project, "find", (filter) => {
      const { snapshot, wait } = read(filter);
      const api = {
        select() { return api; },
        lean() { return wait.then(() => snapshot); },
      };
      return api;
    });
    restores.push(() => Project.find.mock.restore());

    // getProject populates owner and member users from the user store.
    mock.method(Project, "populate", async (doc) => {
      const pick = (id) => {
        const row = state.users.get(hex(id));
        return row ? { _id: row._id, fullName: row.fullName, img: row.img } : null;
      };
      doc.owner = pick(doc.owner);
      for (const entry of doc.members) entry.user = pick(entry.user);
      return doc;
    });
    restores.push(() => Project.populate.mock.restore());

    mock.method(Project, "findOneAndUpdate", (filter, update, options) => {
      state.writes.push({ filter, update, options });
      const api = {
        lean() {
          if (state.writeError) return Promise.reject(state.writeError);
          // Evaluated against the CURRENT state at write time, atomically.
          const doc = [...state.projects.values()].find((candidate) => matchDoc(candidate, filter));
          if (!doc) return Promise.resolve(null);
          for (const [operator, body] of Object.entries(update)) {
            if (operator === "$push") {
              for (const [path, value] of Object.entries(body)) doc[path].push(clone(value));
            } else if (operator === "$pull") {
              for (const [path, condition] of Object.entries(body)) {
                const [key, expected] = Object.entries(condition)[0];
                doc[path] = doc[path].filter((element) => !same(element[key], expected));
              }
            } else if (operator === "$set") {
              for (const [path, value] of Object.entries(body)) {
                const parts = path.match(/^members\.\$\[(\w+)\]\.role$/);
                if (!parts) throw new Error(`unsupported $set path ${path}`);
                const filterKey = `${parts[1]}.user`;
                const wanted = options.arrayFilters.find((entry) => filterKey in entry)[filterKey];
                for (const element of doc.members) if (same(element.user, wanted)) element.role = value;
              }
            } else {
              throw new Error(`unsupported update operator ${operator}`);
            }
          }
          doc.updatedAt = new Date("2026-11-12T12:00:00.000Z");
          return Promise.resolve(clone(doc));
        },
      };
      return api;
    });
    restores.push(() => Project.findOneAndUpdate.mock.restore());

    // Canvas and chat history must never be touched by membership routes.
    for (const [model, method] of [[Canvas, "deleteOne"], [ProjectMessage, "deleteMany"], [ProjectMessage, "create"]]) {
      mock.method(model, method, () => { throw new Error("membership routes must not touch canvas or chat"); });
      restores.push(() => model[method].mock.restore());
    }
    return state;
  }

  async function call(user, method, path, body, headers = {}) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method,
      headers: {
        ...(user ? { "x-clerk-id": user.clerkId } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  const MESSAGE = (response) => response.body?.message;

  it("registers every new route behind protectRoute and /invites/mine before /:id", () => {
    const paths = projectRouter.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
    assert.equal(projectRouter.stack[0].handle.name, "protectRoute");
    for (const route of [
      "get /invites/mine",
      "post /invites/:inviteId/accept",
      "post /invites/:inviteId/decline",
      "post /:id/invites",
      "delete /:id/invites/:inviteId",
      "patch /:id/members/:userId",
      "delete /:id/members/:userId",
      "get /:id/messages",
      "post /:id/messages",
      "get /:id",
    ]) assert.ok(paths.includes(route), route);
    assert.ok(paths.indexOf("get /invites/mine") < paths.indexOf("get /:id"));
    assert.ok(paths.indexOf("post /invites/:inviteId/accept") < paths.indexOf("post /:id/invites"));
  });

  it("answers 401 signed out and 404 for an unsynced user on all seven routes", async () => {
    world();
    const project = addProject(users.owner);
    const unsynced = { clerkId: "clerk_ghost" };
    const routes = [
      ["POST", `/${hex(project._id)}/invites`, { email: "a@b.co", role: "viewer" }],
      ["DELETE", `/${hex(project._id)}/invites/${hex(newId())}`],
      ["GET", "/invites/mine"],
      ["POST", `/invites/${hex(newId())}/accept`],
      ["POST", `/invites/${hex(newId())}/decline`],
      ["PATCH", `/${hex(project._id)}/members/${hex(newId())}`, { role: "viewer" }],
      ["DELETE", `/${hex(project._id)}/members/${hex(newId())}`],
    ];
    for (const [method, path, body] of routes) {
      assert.equal((await call(null, method, path, body)).status, 401, `${method} ${path}`);
      assert.equal((await call(unsynced, method, path, body)).status, 404, `${method} ${path}`);
    }
    assert.equal(state.writes.length, 0);
    // /invites/mine reaches the listing, not GET /:id.
    const listing = await call(users.owner, "GET", "/invites/mine");
    assert.equal(listing.status, 200);
    assert.deepEqual(listing.body, { invites: [] });
  });

  describe("create invitation", () => {
    it("creates a pending invite for an email with no account, exposing only the whitelist", async () => {
      world();
      const project = addProject(users.owner);
      const response = await call(users.owner, "POST", `/${hex(project._id)}/invites`, {
        email: "  New.Person+tag@Example.COM ",
        role: "editor",
        invitedBy: hex(users.outsider._id),
        _id: hex(newId()),
        createdAt: "2000-01-01",
        owner: hex(users.outsider._id),
        members: [{ user: hex(users.outsider._id), role: "editor" }],
        invites: [],
        user: hex(users.outsider._id),
        projectId: hex(newId()),
      });
      assert.equal(response.status, 201);
      assert.deepEqual(Object.keys(response.body), ["invite"]);
      assert.deepEqual(Object.keys(response.body.invite).sort(), ["_id", "createdAt", "email", "invitedBy", "role"]);
      assert.equal(response.body.invite.email, "new.person+tag@example.com");
      assert.equal(response.body.invite.role, "editor");
      assert.equal(response.body.invite.invitedBy, hex(users.owner._id), "the caller, not the body");
      assert.notEqual(response.body.invite.createdAt, "2000-01-01");
      const stored = current(project);
      assert.equal(stored.invites.length, 1);
      assert.equal(stored.members.length, 0, "no member is created directly");
      assert.equal(hex(stored.owner), hex(users.owner._id));
      assert.equal(state.userWrites, 0);
      assert.equal(state.userLookups.length, 0, "no members, so no user lookup at all");
    });

    it("authorizes before it validates and never reveals a project to a non-member", async () => {
      world();
      const project = addProject(users.owner, { members: [member(users.editor, "editor"), member(users.viewer, "viewer")] });
      const bad = { email: 5, role: "owner" };
      const path = `/${hex(project._id)}/invites`;
      assert.deepEqual([(await call(users.outsider, "POST", path, bad)).status, MESSAGE(await call(users.outsider, "POST", path, bad))], [404, "Project not found"]);
      assert.equal((await call(users.admin, "POST", path, bad)).status, 404, "platform admin has no project privilege");
      assert.equal((await call(users.invitee, "POST", path, bad)).status, 404);
      for (const who of [users.editor, users.viewer]) {
        const response = await call(who, "POST", path, bad);
        assert.deepEqual([response.status, MESSAGE(response)], [403, "Only the project owner can do that"]);
      }
      assert.equal((await call(users.owner, "POST", `/${hex(newId())}/invites`, bad)).status, 404);
      assert.equal((await call(users.owner, "POST", "/not-an-id/invites", bad)).status, 404);
      assert.equal(state.writes.length, 0);
    });

    it("validates the body: email first, then role, with no coercion", async () => {
      world();
      const project = addProject(users.owner);
      const path = `/${hex(project._id)}/invites`;
      const email = "Email must be a valid address";
      const role = "Role must be editor or viewer";
      const cases = [
        [{}, email],
        [{ email: "a@b" }, email],
        [{ email: ["a@b.co"], role: "viewer" }, email],
        [{ email: { $ne: "x" }, role: "viewer" }, email],
        [{ email: null, role: "viewer" }, email],
        [{ email: 12345, role: "viewer" }, email],
        [{ email: "a b@c.co", role: "viewer" }, email],
        [{ email: "a@c.co\n", role: "viewer", extra: 1 }, null],
        [{ email: "a\u0001@c.co", role: "viewer" }, email],
        [{ email: `${"a".repeat(243)}@example.com`, role: "viewer" }, email],
        [{ email: "a@c.co" }, role],
        [{ email: "a@c.co", role: "owner" }, role],
        [{ email: "a@c.co", role: "admin" }, role],
        [{ email: "a@c.co", role: ["viewer"] }, role],
        [{ email: "a@c.co", role: "Viewer" }, role],
      ];
      for (const [body, expected] of cases) {
        const response = await call(users.owner, "POST", path, body);
        if (expected === null) assert.equal(response.status, 201, JSON.stringify(body));
        else assert.deepEqual([response.status, MESSAGE(response)], [400, expected], JSON.stringify(body));
      }
      // A body that is not an object (an array, or none at all) takes the email error.
      const array = await call(users.owner, "POST", path, "[]", { "content-type": "application/json" });
      assert.deepEqual([array.status, MESSAGE(array)], [400, email]);
      const none = await call(users.owner, "POST", path);
      assert.deepEqual([none.status, MESSAGE(none)], [400, email]);
      // 254 characters is the boundary, 255 is refused.
      const local = "a".repeat(254 - "@x.co".length);
      const edge = await call(users.owner, "POST", path, { email: `${local}@x.co`, role: "viewer" });
      assert.equal(edge.status, 201);
      const over = await call(users.owner, "POST", path, { email: `${local}a@x.co`, role: "viewer" });
      assert.equal(over.status, 400);
    });

    it("rejects self, existing members (mixed-case), duplicates and a full project, in that order", async () => {
      world();
      const mixed = person("mixed", "Mixed.Case@Example.com");
      const project = addProject(users.owner, { members: [member(mixed, "viewer"), member(users.editor, "editor")] });
      const path = `/${hex(project._id)}/invites`;
      const post = (email) => call(users.owner, "POST", path, { email, role: "viewer" });
      const expectError = async (email, message) => {
        const response = await post(email);
        assert.deepEqual([response.status, MESSAGE(response)], [400, message], email);
      };
      await expectError(" OWNER@example.COM ", "You cannot invite yourself");
      await expectError("mixed.case@example.com", "This person is already a member");
      await expectError("MIXED.CASE@EXAMPLE.COM", "This person is already a member");
      assert.equal((await post("fresh@example.com")).status, 201);
      await expectError("Fresh@Example.com ", "This email is already invited");
      assert.equal(state.writes.length, 1, "every rejected request wrote nothing");
      // The lookup was scoped to this project's member ids and read only id and email.
      assert.ok(state.userLookups.every((filter) => Object.keys(filter).join() === "_id" && filter._id.$in.length === 2));
    });

    it("counts members and pending invites together and honors the tenth seat", async () => {
      world();
      const extra = Array.from({ length: 5 }, (_, index) => person(`m${index}`, `m${index}@example.com`));
      const project = addProject(users.owner, {
        members: extra.map((user) => member(user, "viewer")),
        invites: Array.from({ length: 4 }, (_, index) => invite(`pending${index}@example.com`, "viewer", users.owner)),
      });
      const path = `/${hex(project._id)}/invites`;
      assert.equal((await call(users.owner, "POST", path, { email: "tenth@example.com", role: "viewer" })).status, 201);
      assert.equal(current(project).members.length + current(project).invites.length, 10);
      const full = await call(users.owner, "POST", path, { email: "eleventh@example.com", role: "viewer" });
      assert.deepEqual([full.status, MESSAGE(full)], [400, "A project can have at most 10 members and pending invites"]);
      assert.equal(current(project).invites.length, 5);
    });

    it("counts a member whose User row is missing", async () => {
      world();
      const ghost = { _id: newId() };
      const project = addProject(users.owner, {
        members: [{ user: ghost._id, role: "viewer", addedAt: new Date() }],
        invites: Array.from({ length: 9 }, (_, index) => invite(`p${index}@example.com`, "viewer", users.owner)),
      });
      const response = await call(users.owner, "POST", `/${hex(project._id)}/invites`, { email: "late@example.com", role: "viewer" });
      assert.equal(response.status, 400);
      assert.equal(MESSAGE(response), "A project can have at most 10 members and pending invites");
    });

    it("reports an invalid account email only after owner authorization", async () => {
      world();
      const odd = person("odd", "not an email");
      const project = addProject(odd);
      const outsiderProject = addProject(users.owner);
      const own = await call(odd, "POST", `/${hex(project._id)}/invites`, { email: "a@b.co", role: "viewer" });
      assert.deepEqual([own.status, MESSAGE(own)], [400, "Your account needs a valid email address"]);
      const other = await call(odd, "POST", `/${hex(outsiderProject._id)}/invites`, { email: "a@b.co", role: "viewer" });
      assert.deepEqual([other.status, MESSAGE(other)], [404, "Project not found"]);
    });
  });

  describe("list, accept and decline", () => {
    it("lists only the caller's own offers with minimal projections, newest first", async () => {
      world();
      const first = addProject(users.owner, { name: "First" });
      const second = addProject(users.editor, { name: "Second" });
      const sameTime = new Date("2026-11-12T11:00:00.000Z");
      const a = invite("invitee@example.com", "viewer", users.owner, { createdAt: sameTime });
      const b = invite("invitee@example.com", "editor", users.owner, { createdAt: sameTime });
      const old = invite("invitee@example.com", "viewer", { _id: newId() }, { createdAt: new Date("2026-11-01T00:00:00.000Z") });
      first.invites.push(a, invite("someone.else@example.com", "editor", users.owner), old);
      second.invites.push(b);
      first.members.push(member(users.viewer, "viewer"));

      const response = await call(users.invitee, "GET", "/invites/mine");
      assert.equal(response.status, 200);
      const rows = response.body.invites;
      assert.equal(rows.length, 3);
      const [high, low] = [a, b].map((row) => hex(row._id)).sort().reverse();
      assert.deepEqual(rows.map((row) => row._id), [high, low, hex(old._id)]);
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(), ["_id", "createdAt", "invitedBy", "project", "role"]);
        assert.deepEqual(Object.keys(row.project).sort(), ["_id", "name"]);
        assert.notEqual(row._id, hex(first._id), "the invitation id, not the project id");
      }
      assert.deepEqual(rows.at(-1).invitedBy, null, "a missing inviter yields null");
      const inviter = rows.find((row) => row._id === hex(a._id)).invitedBy;
      assert.deepEqual(inviter, { _id: hex(users.owner._id), fullName: "owner", img: "owner.png" });
      const text = JSON.stringify(response.body);
      for (const secret of ["clerk_", "someone.else", "viewer@example.com", "@example.com"]) {
        assert.equal(text.includes(secret), false, secret);
      }
      assert.deepEqual((await call(users.outsider, "GET", "/invites/mine")).body, { invites: [] });
    });

    it("accepts with the stored role, ignores the body, and swaps the reserved seat at ten", async () => {
      world();
      const fillers = Array.from({ length: 8 }, (_, index) => person(`f${index}`, `f${index}@example.com`));
      const project = addProject(users.owner, { members: fillers.map((user) => member(user, "viewer")) });
      const mine = invite("invitee@example.com", "viewer", users.owner);
      project.invites.push(mine, invite("other@example.com", "editor", users.owner));
      assert.equal(project.members.length + project.invites.length, 10);

      const response = await call(users.invitee, "POST", `/invites/${hex(mine._id)}/accept`, {
        role: "editor",
        projectId: hex(newId()),
        user: hex(users.outsider._id),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { projectId: hex(project._id), role: "viewer" });
      const stored = current(project);
      assert.equal(stored.members.length + stored.invites.length, 10, "swapped, never exceeded");
      assert.equal(stored.invites.some((row) => hex(row._id) === hex(mine._id)), false);
      const joined = stored.members.find((row) => hex(row.user) === hex(users.invitee._id));
      assert.equal(joined.role, "viewer");
      assert.ok(joined.addedAt instanceof Date);

      const again = await call(users.invitee, "POST", `/invites/${hex(mine._id)}/accept`);
      assert.deepEqual([again.status, MESSAGE(again)], [404, "Invitation not found"]);
      assert.equal(current(project).members.filter((row) => hex(row.user) === hex(users.invitee._id)).length, 1);

      // The new member now sees the project through the existing routes.
      const detail = await call(users.invitee, "GET", `/${hex(project._id)}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.role, "viewer");
      assert.equal("invites" in detail.body.project, false);
    });

    it("never matches the id of one invitation with the email of another", async () => {
      world();
      const project = addProject(users.owner);
      const theirs = invite("someone.else@example.com", "editor", users.owner);
      const mine = invite("invitee@example.com", "viewer", users.owner);
      project.invites.push(theirs, mine);
      const before = JSON.stringify(current(project));

      for (const action of ["accept", "decline"]) {
        const response = await call(users.invitee, "POST", `/invites/${hex(theirs._id)}/${action}`);
        assert.deepEqual([response.status, MESSAGE(response)], [404, "Invitation not found"], action);
        assert.equal(Object.keys(response.body).join(), "message", "no project metadata");
      }
      assert.equal(JSON.stringify(current(project)), before, "nothing was consumed");
      assert.equal(state.writes.length, 0);

      const real = await call(users.invitee, "POST", `/invites/${hex(mine._id)}/accept`);
      assert.equal(real.status, 200);
      assert.equal(current(project).invites.length, 1);
      assert.equal(current(project).invites[0].email, "someone.else@example.com");
      // The accept filter names ONE element holding both id and email.
      const filter = state.writes.at(-1).filter;
      assert.equal(hex(filter.invites.$elemMatch._id), hex(mine._id));
      assert.equal(filter.invites.$elemMatch.email, "invitee@example.com");
    });

    it("answers 404 for a malformed id, another user's offer and a missing one, and never joins the owner", async () => {
      world();
      const project = addProject(users.owner);
      const ownOffer = invite("owner@example.com", "viewer", users.editor);
      project.invites.push(ownOffer);
      for (const id of ["nope", "123", hex(newId())]) {
        const response = await call(users.invitee, "POST", `/invites/${id}/accept`);
        assert.deepEqual([response.status, MESSAGE(response)], [404, "Invitation not found"], id);
      }
      const owner = await call(users.owner, "POST", `/invites/${hex(ownOffer._id)}/accept`);
      assert.deepEqual([owner.status, MESSAGE(owner)], [400, "Owner cannot join as a member"]);
      assert.equal(current(project).members.length, 0);

      const existing = invite("viewer@example.com", "editor", users.owner);
      project.members.push(member(users.viewer, "viewer"));
      project.invites.push(existing);
      const dup = await call(users.viewer, "POST", `/invites/${hex(existing._id)}/accept`);
      assert.deepEqual([dup.status, MESSAGE(dup)], [400, "You are already a member"]);
      assert.equal(current(project).members.length, 1);
    });

    it("declines only the addressed offer, frees the seat and repeats as 404", async () => {
      world();
      const project = addProject(users.owner, { members: Array.from({ length: 5 }, (_, i) => member(person(`d${i}`, `d${i}@example.com`), "viewer")) });
      const mine = invite("invitee@example.com", "viewer", users.owner);
      project.invites.push(mine, ...Array.from({ length: 4 }, (_, i) => invite(`q${i}@example.com`, "viewer", users.owner)));
      const declined = await call(users.invitee, "POST", `/invites/${hex(mine._id)}/decline`, { anything: true });
      assert.deepEqual([declined.status, declined.body], [200, { message: "Invitation declined" }]);
      assert.equal(current(project).invites.length, 4);
      assert.equal(current(project).members.length, 5, "declining never adds a member");
      assert.equal((await call(users.invitee, "POST", `/invites/${hex(mine._id)}/decline`)).status, 404);
      const reuse = await call(users.owner, "POST", `/${hex(project._id)}/invites`, { email: "next@example.com", role: "viewer" });
      assert.equal(reuse.status, 201, "the freed seat is usable");
    });

    it("reports an invalid account email for list, accept and decline", async () => {
      world();
      const odd = person("odd", "nope");
      for (const [method, path] of [["GET", "/invites/mine"], ["POST", `/invites/${hex(newId())}/accept`], ["POST", `/invites/${hex(newId())}/decline`]]) {
        const response = await call(odd, method, path);
        assert.deepEqual([response.status, MESSAGE(response)], [400, "Your account needs a valid email address"], path);
      }
      const bad = await call(odd, "POST", "/invites/xyz/accept");
      assert.equal(bad.status, 404, "a malformed invitation id is checked first");
    });
  });

  describe("revoke", () => {
    it("lets only the owner remove one addressed pending invite from this project", async () => {
      world();
      const project = addProject(users.owner, { members: [member(users.editor, "editor")] });
      const other = addProject(users.owner);
      const a = invite("a@example.com", "viewer", users.owner);
      const b = invite("b@example.com", "viewer", users.owner);
      const foreign = invite("c@example.com", "viewer", users.owner);
      project.invites.push(a, b);
      other.invites.push(foreign);

      const forbidden = await call(users.editor, "DELETE", `/${hex(project._id)}/invites/${hex(a._id)}`);
      assert.deepEqual([forbidden.status, MESSAGE(forbidden)], [403, "Only the project owner can do that"]);
      assert.equal((await call(users.outsider, "DELETE", `/${hex(project._id)}/invites/${hex(a._id)}`)).status, 404);
      const wrongProject = await call(users.owner, "DELETE", `/${hex(project._id)}/invites/${hex(foreign._id)}`);
      assert.deepEqual([wrongProject.status, MESSAGE(wrongProject)], [404, "Invitation not found"]);
      assert.equal(current(other).invites.length, 1);

      const revoked = await call(users.owner, "DELETE", `/${hex(project._id)}/invites/${hex(a._id)}`, { x: 1 });
      assert.deepEqual([revoked.status, revoked.body], [200, { message: "Invitation revoked" }]);
      assert.deepEqual(current(project).invites.map((row) => hex(row._id)), [hex(b._id)]);
      assert.equal(current(project).members.length, 1, "no member was removed");
      const again = await call(users.owner, "DELETE", `/${hex(project._id)}/invites/${hex(a._id)}`);
      assert.deepEqual([again.status, MESSAGE(again)], [404, "Invitation not found"]);
      assert.equal((await call(users.owner, "DELETE", `/${hex(project._id)}/invites/bogus`)).status, 404);
    });
  });

  describe("change role and remove", () => {
    it("changes a role, keeps addedAt, and treats the same role as a matched success", async () => {
      world();
      const project = addProject(users.owner, { members: [member(users.editor, "editor"), member(users.viewer, "viewer")] });
      const path = `/${hex(project._id)}/members/${hex(users.editor._id)}`;
      const before = current(project).members[0].addedAt.getTime();

      const changed = await call(users.owner, "PATCH", path, { role: "viewer", user: hex(users.outsider._id), addedAt: "2000-01-01" });
      assert.deepEqual([changed.status, changed.body], [200, { member: { userId: hex(users.editor._id), role: "viewer" } }]);
      const stored = current(project).members;
      assert.equal(stored[0].role, "viewer");
      assert.equal(stored[0].addedAt.getTime(), before);
      assert.equal(stored[1].role, "viewer", "other members are untouched");
      assert.deepEqual(state.writes.at(-1).options.arrayFilters.length, 1);

      const noop = await call(users.owner, "PATCH", path, { role: "viewer" });
      assert.deepEqual([noop.status, noop.body.member.role], [200, "viewer"]);
    });

    it("rejects the owner as a target, non-members and invitation ids, and authorizes first", async () => {
      world();
      const pending = invite("later@example.com", "viewer", users.owner);
      const project = addProject(users.owner, { members: [member(users.editor, "editor")], invites: [pending] });
      const base = `/${hex(project._id)}/members/`;
      const owner = await call(users.owner, "PATCH", base + hex(users.owner._id), { role: "viewer" });
      assert.deepEqual([owner.status, MESSAGE(owner)], [400, "Owner role cannot be changed"]);
      for (const target of [hex(users.outsider._id), hex(pending._id), "nope", hex(newId())]) {
        const response = await call(users.owner, "PATCH", base + target, { role: "viewer" });
        assert.deepEqual([response.status, MESSAGE(response)], [404, "Member not found"], target);
      }
      const bad = await call(users.owner, "PATCH", base + hex(users.editor._id), { role: "owner" });
      assert.deepEqual([bad.status, MESSAGE(bad)], [400, "Role must be editor or viewer"]);
      assert.equal((await call(users.owner, "PATCH", base + hex(users.editor._id), "[]", { "content-type": "application/json" })).status, 400);
      const editor = await call(users.editor, "PATCH", base + hex(users.editor._id), { role: "owner" });
      assert.deepEqual([editor.status, MESSAGE(editor)], [403, "Only the project owner can do that"]);
      assert.equal((await call(users.outsider, "PATCH", base + hex(users.editor._id), { role: "viewer" })).status, 404);
      assert.equal(current(project).owner.toHexString(), hex(users.owner._id), "ownership cannot move");
      assert.equal(state.writes.length, 0);
    });

    it("removes a member for the owner and lets a member leave only for themselves", async () => {
      world();
      const keep = invite("editor@example.com", "viewer", users.owner);
      const project = addProject(users.owner, {
        members: [member(users.editor, "editor"), member(users.viewer, "viewer")],
        invites: [keep],
      });
      const base = `/${hex(project._id)}/members/`;

      const other = await call(users.editor, "DELETE", base + hex(users.viewer._id));
      assert.deepEqual([other.status, MESSAGE(other)], [403, "Only the project owner can do that"]);
      const unknown = await call(users.editor, "DELETE", base + hex(newId()));
      assert.equal(unknown.status, 403, "no target existence is revealed to a non-owner");
      assert.equal((await call(users.outsider, "DELETE", base + hex(users.viewer._id))).status, 404);

      const left = await call(users.editor, "DELETE", base + hex(users.editor._id));
      assert.deepEqual([left.status, left.body], [200, { message: "Project left" }]);
      assert.deepEqual(current(project).members.map((row) => hex(row.user)), [hex(users.viewer._id)]);
      assert.equal(current(project).invites.length, 1, "invites by email are not removed");
      const repeat = await call(users.editor, "DELETE", base + hex(users.editor._id));
      assert.deepEqual([repeat.status, MESSAGE(repeat)], [404, "Project not found"]);

      const removed = await call(users.owner, "DELETE", base + hex(users.viewer._id));
      assert.deepEqual([removed.status, removed.body], [200, { message: "Member removed" }]);
      const missing = await call(users.owner, "DELETE", base + hex(users.viewer._id));
      assert.deepEqual([missing.status, MESSAGE(missing)], [404, "Member not found"]);
      const self = await call(users.owner, "DELETE", base + hex(users.owner._id));
      assert.deepEqual([self.status, MESSAGE(self)], [400, "Owner cannot leave the project"]);
      assert.equal((await call(users.owner, "DELETE", base + "nope")).status, 404);
    });
  });

  it("runs the full lifecycle without touching canvas, chat or users", async () => {
    world();
    const project = addProject(users.owner);
    const path = `/${hex(project._id)}`;

    const created = await call(users.owner, "POST", `${path}/invites`, { email: "invitee@example.com", role: "viewer" });
    assert.equal(created.status, 201);
    const owned = await call(users.owner, "GET", path);
    assert.equal(owned.body.project.invites[0].email, "invitee@example.com");
    assert.equal(owned.body.project.invites[0].invitedBy.toString(), hex(users.owner._id));

    const listed = await call(users.invitee, "GET", "/invites/mine");
    assert.equal(listed.body.invites.length, 1);
    assert.equal((await call(users.invitee, "GET", path)).status, 404, "an invitation grants no project access");

    const accepted = await call(users.invitee, "POST", `/invites/${listed.body.invites[0]._id}/accept`);
    assert.equal(accepted.status, 200);
    assert.equal((await call(users.invitee, "GET", path)).body.role, "viewer");

    const promoted = await call(users.owner, "PATCH", `${path}/members/${hex(users.invitee._id)}`, { role: "editor" });
    assert.equal(promoted.status, 200);
    assert.equal((await call(users.invitee, "GET", path)).body.role, "editor");

    const left = await call(users.invitee, "DELETE", `${path}/members/${hex(users.invitee._id)}`);
    assert.equal(left.body.message, "Project left");
    assert.equal((await call(users.invitee, "GET", path)).status, 404);
    assert.equal(state.userWrites, 0);
  });

  describe("controlled races on a shared snapshot", () => {
    const wrote = () => state.writes.length;

    it("lets exactly one of two invitations for the same canonical email win", async () => {
      world();
      const project = addProject(users.owner);
      const path = `/${hex(project._id)}/invites`;
      stageReads(2);
      const [a, b] = await Promise.all([
        call(users.owner, "POST", path, { email: "Race@Example.com", role: "viewer" }),
        call(users.owner, "POST", path, { email: " race@example.com", role: "editor" }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 400]);
      const loser = [a, b].find((response) => response.status === 400);
      assert.equal(MESSAGE(loser), "This email is already invited");
      assert.equal(current(project).invites.length, 1);
      assert.equal(wrote(), 2, "both attempted; the stale snapshot matched nothing");
    });

    it("lets two different invitations compete for the tenth seat, one succeeding", async () => {
      world();
      const project = addProject(users.owner, {
        members: Array.from({ length: 4 }, (_, i) => member(person(`t${i}`, `t${i}@example.com`), "viewer")),
        invites: Array.from({ length: 5 }, (_, i) => invite(`s${i}@example.com`, "viewer", users.owner)),
      });
      const path = `/${hex(project._id)}/invites`;
      stageReads(2);
      const [a, b] = await Promise.all([
        call(users.owner, "POST", path, { email: "first@example.com", role: "viewer" }),
        call(users.owner, "POST", path, { email: "second@example.com", role: "viewer" }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 400]);
      assert.equal(current(project).members.length + current(project).invites.length, 10);
      assert.equal(MESSAGE([a, b].find((response) => response.status === 400)), "A project can have at most 10 members and pending invites");
    });

    it("lets exactly one consumer win when the same invite is accepted twice", async () => {
      world();
      const project = addProject(users.owner);
      const offer = invite("invitee@example.com", "viewer", users.owner);
      project.invites.push(offer);
      stageReads(2);
      const [a, b] = await Promise.all([
        call(users.invitee, "POST", `/invites/${hex(offer._id)}/accept`),
        call(users.invitee, "POST", `/invites/${hex(offer._id)}/accept`),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [200, 404]);
      assert.equal(current(project).members.length, 1);
      assert.equal(current(project).invites.length, 0);
    });

    it("lets accept race decline and revoke with one winner and no recreated invite", async () => {
      for (const loser of ["decline", "revoke"]) {
        world();
        const project = addProject(users.owner);
        const offer = invite("invitee@example.com", "viewer", users.owner);
        project.invites.push(offer);
        stageReads(2);
        const rival = loser === "decline"
          ? call(users.invitee, "POST", `/invites/${hex(offer._id)}/decline`)
          : call(users.owner, "DELETE", `/${hex(project._id)}/invites/${hex(offer._id)}`);
        const [accept, other] = await Promise.all([call(users.invitee, "POST", `/invites/${hex(offer._id)}/accept`), rival]);
        const winners = [accept, other].filter((response) => response.status === 200);
        assert.equal(winners.length, 1, loser);
        const failed = winners[0] === accept ? other : accept;
        assert.deepEqual([failed.status, MESSAGE(failed)], [404, "Invitation not found"], loser);
        assert.equal(current(project).invites.length, 0, `${loser}: the consumed invite is not recreated`);
        assert.equal(current(project).members.length, accept.status === 200 ? 1 : 0, loser);
      }
    });

    it("lets accepts of different invites race without losing either member", async () => {
      world();
      const project = addProject(users.owner);
      const other = person("other", "other@example.com");
      const a = invite("invitee@example.com", "viewer", users.owner);
      const b = invite("other@example.com", "editor", users.owner);
      project.invites.push(a, b);
      stageReads(2);
      const [first, second] = await Promise.all([
        call(users.invitee, "POST", `/invites/${hex(a._id)}/accept`),
        call(other, "POST", `/invites/${hex(b._id)}/accept`),
      ]);
      const statuses = [first.status, second.status];
      assert.ok(statuses.includes(200));
      const stored = current(project);
      // A loser gets the safe conflict, never a silent loss; retrying then works.
      for (const [response, user, offer] of [[first, users.invitee, a], [second, other, b]]) {
        if (response.status !== 200) {
          assert.deepEqual([response.status, MESSAGE(response)], [400, "Project membership changed. Please try again."]);
          const retry = await call(user, "POST", `/invites/${hex(offer._id)}/accept`);
          assert.equal(retry.status, 200);
        }
      }
      assert.equal(current(project).members.length, 2);
      assert.equal(current(project).invites.length, 0);
      assert.ok(stored);
    });

    it("never recreates a removed member from a stale role change, and a stale removal never undoes a role change", async () => {
      world();
      const project = addProject(users.owner, { members: [member(users.editor, "editor")] });
      stageReads(2);
      const [patch, remove] = await Promise.all([
        call(users.owner, "PATCH", `/${hex(project._id)}/members/${hex(users.editor._id)}`, { role: "viewer" }),
        call(users.owner, "DELETE", `/${hex(project._id)}/members/${hex(users.editor._id)}`),
      ]);
      const stored = current(project).members;
      if (remove.status === 200) {
        assert.deepEqual([patch.status, MESSAGE(patch)], [404, "Member not found"]);
        assert.equal(stored.length, 0, "the removed member stays removed");
      } else {
        assert.equal(patch.status, 200);
        assert.deepEqual([remove.status, MESSAGE(remove)], [400, "Project membership changed. Please try again."]);
        assert.deepEqual(stored.map((row) => row.role), ["viewer"], "the stale removal changed nothing");
      }
    });

    it("lets exactly one of a create and an accept win on the same snapshot", async () => {
      world();
      const project = addProject(users.owner);
      const offer = invite("invitee@example.com", "editor", users.owner);
      project.invites.push(offer);
      stageReads(2);
      const [accept, create] = await Promise.all([
        call(users.invitee, "POST", `/invites/${hex(offer._id)}/accept`),
        call(users.owner, "POST", `/${hex(project._id)}/invites`, { email: "new@example.com", role: "viewer" }),
      ]);
      const stored = current(project);
      if (accept.status === 200) {
        assert.deepEqual([create.status, MESSAGE(create)], [400, "Project membership changed. Please try again."]);
        assert.deepEqual([stored.members.length, stored.invites.length], [1, 0]);
      } else {
        assert.equal(create.status, 201);
        assert.deepEqual([accept.status, MESSAGE(accept)], [400, "Project membership changed. Please try again."]);
        assert.deepEqual(stored.invites.map((row) => row.email).sort(), ["invitee@example.com", "new@example.com"]);
        assert.equal(stored.members.length, 0);
      }
    });

    it("preserves an unrelated name change made between the read and the membership write", async () => {
      world();
      const project = addProject(users.owner, { members: [member(users.editor, "editor")] });
      const path = `/${hex(project._id)}/members/${hex(users.editor._id)}`;
      const held = stageReads(1, { manual: true });
      const pending = call(users.owner, "PATCH", path, { role: "viewer" });
      await held.arrived;
      // The metadata update lands after the read and before the write.
      current(project).name = "Renamed meanwhile";
      current(project).updatedAt = new Date("2026-11-12T13:00:00.000Z");
      held.release();
      const response = await pending;
      assert.equal(response.status, 200);
      assert.equal(current(project).name, "Renamed meanwhile");
      assert.equal(current(project).members[0].role, "viewer");
      const guard = JSON.stringify(state.writes.at(-1).filter);
      assert.equal(guard.includes("updatedAt"), false, "no time-based guard");
      assert.equal(Object.hasOwn(state.writes.at(-1).update, "$set"), true);
      assert.equal(JSON.stringify(state.writes.at(-1).update).includes("name"), false, "only the role is written");
    });

    it("sends guarded filters with authority and the exact snapshot, and never retries", async () => {
      world();
      const project = addProject(users.owner, { members: [member(users.editor, "editor")] });
      project.invites.push(invite("x@example.com", "viewer", users.owner));
      await call(users.owner, "PATCH", `/${hex(project._id)}/members/${hex(users.editor._id)}`, { role: "viewer" });
      const { filter } = state.writes.at(-1);
      assert.equal(hex(filter._id), hex(project._id));
      assert.equal(hex(filter.owner), hex(users.owner._id));
      assert.equal(hex(filter["members.user"]), hex(users.editor._id));
      const clauses = filter.$and.map((part) => Object.keys(part)[0]);
      assert.deepEqual(clauses, ["members", "members", "invites", "invites"]);
      assert.deepEqual(filter.$and[0], { members: { $size: 1 } });
      assert.deepEqual(filter.$and[2], { invites: { $size: 1 } });

      // A stale snapshot misses, is classified once and not retried.
      const held = stageReads(1, { manual: true });
      const stale = call(users.owner, "PATCH", `/${hex(project._id)}/members/${hex(users.editor._id)}`, { role: "editor" });
      await held.arrived;
      current(project).invites.push(invite("y@example.com", "viewer", users.owner));
      held.release();
      const response = await stale;
      assert.deepEqual([response.status, MESSAGE(response)], [400, "Project membership changed. Please try again."]);
      assert.equal(current(project).members[0].role, "viewer", "the stale write changed nothing");
    });
  });

  it("surfaces an unexpected persistence error instead of a false success", async () => {
    world();
    const project = addProject(users.owner);
    state.writeError = new Error("write failed");
    const response = await call(users.owner, "POST", `/${hex(project._id)}/invites`, { email: "a@b.co", role: "viewer" });
    assert.equal(response.status, 500);
    assert.equal(current(project).invites.length, 0);
  });
});
