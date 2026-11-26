// 3dfolio-owned: unit tests for src/cloud/cloudCore.js (run with npm test).
import test from "node:test";
import assert from "node:assert/strict";
import {
  DIAGRAM_FIELDS,
  MESSAGES,
  authTransition,
  createCloudCore,
  fromServerDiagram,
  toRequestBody,
} from "../src/cloud/cloudCore.js";

const httpError = (status, message = "boom") => {
  const error = new Error(message);
  error.response = { status };
  return error;
};

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup({ localIds = [], api = {} } = {}) {
  const calls = [];
  const toasts = [];
  const userIds = [];
  const local = new Set(localIds);
  const fakeApi = {
    list: async () => ({ userId: "u1", diagrams: [{ diagramId: "a" }] }),
    get: async (id) => ({
      diagramId: id,
      name: "n",
      revision: 1,
      canWrite: true,
      tables: [],
      lastModified: "2026-01-01T00:00:00.000Z",
    }),
    create: async (body) => {
      calls.push(["create", body]);
      return { diagramId: body.diagramId, revision: 1 };
    },
    update: async (id, body) => {
      calls.push(["update", id, body]);
      return { diagramId: id, revision: body.baseRevision + 1 };
    },
    remove: async (id) => {
      calls.push(["remove", id]);
    },
    ...api,
  };
  const fakeLocal = {
    has: async (id) => {
      calls.push(["local.has", id]);
      return local.has(id);
    },
    save: async (payload) => {
      calls.push(["local.save", payload]);
    },
    remove: async (id) => {
      calls.push(["local.remove", id]);
      local.delete(id);
    },
  };
  const core = createCloudCore({
    api: fakeApi,
    local: fakeLocal,
    notify: (message, opts) => toasts.push({ message, ...opts }),
    onUserId: (id) => userIds.push(id),
  });
  const names = (n) => calls.filter((c) => c[0] === n);
  return { core, calls, toasts, userIds, names };
}

const payload = (id = "a", extra = {}) => ({ diagramId: id, name: "n", tables: [], ...extra });

test("toRequestBody keeps the 13 fields in order and drops the rest", () => {
  const full = {};
  for (const key of DIAGRAM_FIELDS) full[key] = key;
  const body = toRequestBody({
    ...full,
    gistId: "g",
    lastModified: new Date(),
    loadedFromGistId: "l",
  });
  assert.deepEqual(Object.keys(body), DIAGRAM_FIELDS);
  assert.equal(DIAGRAM_FIELDS.length, 13);
  const partial = toRequestBody({ ...full, enums: undefined, types: undefined });
  assert.equal("enums" in partial, false);
  assert.equal("types" in partial, false);
});

test("fromServerDiagram shapes a server diagram", () => {
  const out = fromServerDiagram({
    diagramId: "a",
    revision: 4,
    canWrite: false,
    name: "x",
    lastModified: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(out.lastModified instanceof Date);
  assert.equal(out.gistId, "");
  assert.equal(out.loadedFromGistId, "");
  assert.equal(out.revision, 4);
  assert.equal(out.canWrite, false);
  assert.equal(out.name, "x");
});

test("load returns the diagram and later saves use its revision", async () => {
  const t = setup({
    api: { get: async (id) => ({ diagramId: id, revision: 7, lastModified: "2026-01-01" }) },
  });
  const d = await t.core.load("a");
  assert.equal(d.revision, 7);
  await t.core.save(payload(), { isNew: false });
  assert.equal(t.names("update")[0][2].baseRevision, 7);
});

test("load: 404 is null without a toast, 500 is null with one toast", async () => {
  const t404 = setup({
    api: {
      get: async () => {
        throw httpError(404);
      },
    },
  });
  assert.equal(await t404.core.load("a"), null);
  assert.equal(t404.toasts.length, 0);
  const t500 = setup({
    api: {
      get: async () => {
        throw httpError(500, "server down");
      },
    },
  });
  assert.equal(await t500.core.load("a"), null);
  assert.equal(t500.toasts.length, 1);
  assert.equal(t500.toasts[0].sticky, false);
  assert.ok(t500.toasts[0].message.includes("server down"));
});

test("save isNew creates, then updates with base revision 1", async () => {
  const t = setup();
  await t.core.save(payload("a", { gistId: "x" }), { isNew: true });
  assert.equal(t.names("create").length, 1);
  assert.equal("gistId" in t.names("create")[0][1], false);
  await t.core.save(payload(), { isNew: true });
  assert.equal(t.names("create").length, 1);
  assert.equal(t.names("update")[0][2].baseRevision, 1);
});

test("local diagrams save to IndexedDB, new ones never ask local", async () => {
  const t = setup({ localIds: ["a"] });
  const p = payload("a", { pan: { x: 1, y: 2 } });
  await t.core.save(p, { isNew: false });
  assert.deepEqual(t.names("local.save")[0][1], p);
  assert.equal(t.calls.filter((c) => !c[0].startsWith("local")).length, 0);
  const t2 = setup({ localIds: ["a"] });
  await t2.core.save(payload("a"), { isNew: true });
  assert.equal(t2.names("local.has").length, 0);
});

test("save of an unknown non-local id rejects and notifies once", async () => {
  const t = setup();
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      t.core.save(payload("z"), { isNew: false }),
      (e) => e.code === "cloud-not-loaded",
    );
  }
  assert.equal(t.calls.filter((c) => ["create", "update"].includes(c[0])).length, 0);
  assert.equal(t.toasts.length, 1);
  assert.equal(t.toasts[0].message, MESSAGES.notLoaded);
});

test("each update uses the revision returned by the previous one", async () => {
  const t = setup();
  await t.core.save(payload(), { isNew: true });
  for (let i = 0; i < 3; i++) await t.core.save(payload(), { isNew: false });
  assert.deepEqual(
    t.names("update").map((c) => c[2].baseRevision),
    [1, 2, 3],
  );
});

test("queue runs saves for one id in order and survives a failure", async () => {
  const gate = deferred();
  const started = [];
  const t = setup({
    api: {
      update: async (id, body) => {
        started.push(body.baseRevision);
        if (started.length === 1) await gate.promise;
        return { revision: body.baseRevision + 1 };
      },
    },
  });
  await t.core.save(payload(), { isNew: true });
  const first = t.core.save(payload(), { isNew: false });
  const second = t.core.save(payload(), { isNew: false });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(started, [1]);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(started, [1, 2]);

  let failedOnce = false;
  const failing = setup({
    api: {
      update: async (id, body) => {
        if (!failedOnce) {
          failedOnce = true;
          throw httpError(500);
        }
        return { revision: body.baseRevision + 1 };
      },
    },
  });
  await failing.core.save(payload(), { isNew: true });
  const f1 = failing.core.save(payload(), { isNew: false });
  const f2 = failing.core.save(payload(), { isNew: false });
  await assert.rejects(f1);
  await f2;
});

test("conflict stops saving until the diagram is loaded again", async () => {
  let fail = true;
  const t = setup({
    api: {
      update: async (id, body) => {
        t.calls.push(["update", id, body]);
        if (fail) throw httpError(409, "conflict");
        return { revision: body.baseRevision + 1 };
      },
      get: async (id) => ({ diagramId: id, revision: 9, lastModified: "2026-01-01" }),
    },
  });
  await t.core.save(payload(), { isNew: true });
  await assert.rejects(t.core.save(payload(), { isNew: false }));
  assert.equal(t.toasts.length, 1);
  assert.equal(t.toasts[0].sticky, true);
  await assert.rejects(
    t.core.save(payload(), { isNew: false }),
    (e) => e.code === "cloud-conflict",
  );
  assert.equal(t.toasts.length, 1);
  assert.equal(t.names("update").length, 1);
  await t.core.load("a");
  fail = false;
  await t.core.save(payload(), { isNew: false });
  assert.equal(t.names("update").length, 2);
  assert.equal(t.names("update")[1][2].baseRevision, 9);
});

test("repeated 413 toasts once, again after a success; 500 never toasts", async () => {
  let mode = "413";
  const t = setup({
    api: {
      update: async (id, body) => {
        if (mode === "413") throw httpError(413, "Diagram is too large");
        if (mode === "500") throw httpError(500);
        return { revision: body.baseRevision + 1 };
      },
    },
  });
  await t.core.save(payload(), { isNew: true });
  await assert.rejects(t.core.save(payload(), { isNew: false }));
  await assert.rejects(t.core.save(payload(), { isNew: false }));
  assert.equal(t.toasts.length, 1);
  assert.equal(t.toasts[0].message, "Cloud save failed: Diagram is too large");
  mode = "ok";
  await t.core.save(payload(), { isNew: false });
  mode = "413";
  await assert.rejects(t.core.save(payload(), { isNew: false }));
  assert.equal(t.toasts.length, 2);
  mode = "500";
  await assert.rejects(t.core.save(payload(), { isNew: false }));
  assert.equal(t.toasts.length, 2);
});

test("remove handles local, cloud, 404 and failure", async () => {
  const loc = setup({ localIds: ["a"] });
  await loc.core.remove("a");
  assert.equal(loc.names("local.remove").length, 1);
  assert.equal(loc.names("remove").length, 0);

  const t = setup();
  await t.core.save(payload("c"), { isNew: true });
  await t.core.remove("c");
  assert.equal(t.names("remove").length, 1);
  await assert.rejects(
    t.core.save(payload("c"), { isNew: false }),
    (e) => e.code === "cloud-not-loaded",
  );

  const nf = setup({
    api: {
      remove: async () => {
        throw httpError(404);
      },
    },
  });
  await nf.core.remove("x");

  const bad = setup({
    api: {
      remove: async () => {
        throw httpError(500);
      },
    },
  });
  await assert.rejects(bad.core.remove("x"));
});

test("list returns diagrams and reports the user id; failures propagate", async () => {
  const t = setup();
  assert.deepEqual(await t.core.list(), [{ diagramId: "a" }]);
  assert.deepEqual(t.userIds, ["u1"]);
  const err = httpError(500);
  const bad = setup({
    api: {
      list: async () => {
        throw err;
      },
    },
  });
  await assert.rejects(bad.core.list(), (e) => e === err);
});

test("authTransition", () => {
  assert.equal(authTransition(undefined, "a"), "none");
  assert.equal(authTransition("a", undefined), "none");
  assert.equal(authTransition("a", "a"), "none");
  assert.equal(authTransition(null, null), "none");
  assert.equal(authTransition("a", null), "signed-out");
  assert.equal(authTransition(null, "a"), "reload");
  assert.equal(authTransition("a", "b"), "reload");
});
