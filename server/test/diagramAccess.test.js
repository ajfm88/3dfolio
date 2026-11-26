import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import * as diagramAccess from "../src/lib/diagramAccess.js";
import Diagram from "../src/models/diagram.model.js";
import {
  DEFAULT_DATABASE,
  DEFAULT_DIAGRAM_NAME,
  DIAGRAM_MEMBER_ROLES,
  DIAGRAM_NAME_MAX,
  MAX_DIAGRAM_BYTES,
  MAX_OWNED_DIAGRAMS,
  MAX_STORAGE_BYTES,
  can,
  fitsStorage,
  parseBaseRevision,
  parseDiagramBody,
  parseDiagramId,
  roleOf,
  shapeDiagram,
  shapeListItem,
  shapeOwner,
  storageAfterWrite,
} from "../src/lib/diagramAccess.js";

const ownerId = new mongoose.Types.ObjectId();
const editorId = new mongoose.Types.ObjectId();
const viewerId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

const ACTIONS = ["view", "edit", "version", "share", "manage", "delete", "leave"];
const TABLE = {
  owner: { view: true, edit: true, version: true, share: true, manage: true, delete: true, leave: false },
  editor: { view: true, edit: true, version: true, share: true, manage: false, delete: false, leave: true },
  viewer: { view: true, edit: false, version: false, share: false, manage: false, delete: false, leave: true },
};
const CONTENT_KEYS = ["tables", "references", "notes", "areas", "views", "enums", "types", "sqlHeader", "pan", "zoom"];

function minimal(extra = {}) {
  return { tables: [], references: [], ...extra };
}

function contentOf(sqlHeader) {
  return JSON.stringify({
    tables: [],
    references: [],
    notes: [],
    areas: [],
    views: [],
    enums: [],
    types: [],
    sqlHeader,
    pan: { x: 0, y: 0 },
    zoom: 1,
  });
}

describe("diagramAccess exports", () => {
  it("exports exactly the diagram access surface and nothing from a model", () => {
    assert.deepEqual(Object.keys(diagramAccess).sort(), [
      "DEFAULT_DATABASE",
      "DEFAULT_DIAGRAM_NAME",
      "DIAGRAM_MEMBER_ROLES",
      "DIAGRAM_NAME_MAX",
      "MAX_DIAGRAM_BYTES",
      "MAX_OWNED_DIAGRAMS",
      "MAX_STORAGE_BYTES",
      "can",
      "fitsStorage",
      "parseBaseRevision",
      "parseDiagramBody",
      "parseDiagramId",
      "roleOf",
      "shapeDiagram",
      "shapeListItem",
      "shapeOwner",
      "storageAfterWrite",
    ]);
    assert.deepEqual(DIAGRAM_MEMBER_ROLES, ["editor", "viewer"]);
    assert.equal(MAX_DIAGRAM_BYTES, 1_048_576);
    assert.equal(MAX_OWNED_DIAGRAMS, 50);
    assert.equal(MAX_STORAGE_BYTES, 25 * 1_048_576);
    assert.equal(DIAGRAM_NAME_MAX, 200);
    assert.equal(DEFAULT_DIAGRAM_NAME, "Untitled diagram");
    assert.equal(DEFAULT_DATABASE, "generic");

    const source = readFileSync(new URL("../src/lib/diagramAccess.js", import.meta.url), "utf8");
    assert.deepEqual(source.match(/^import .+$/gm), ['import mongoose from "mongoose";']);
    assert.equal(/diagram\.model|projectAccess|projectMembership|mongoose\.model/.test(source), false);
    assert.equal(/\bDate\.now\b|\bsetTimeout\b|\bsetInterval\b|\bMath\.random\b/.test(source), false);
  });
});

describe("roleOf", () => {
  it("resolves owner, editor, viewer, and a stranger", () => {
    const diagram = {
      owner: ownerId,
      members: [
        { user: editorId, role: "editor" },
        { user: viewerId, role: "viewer" },
      ],
    };
    assert.equal(roleOf(diagram, ownerId), "owner");
    assert.equal(roleOf(diagram, editorId), "editor");
    assert.equal(roleOf(diagram, viewerId), "viewer");
    assert.equal(roleOf(diagram, strangerId), null);
  });

  it("accepts populated documents and hex strings on both sides", () => {
    const diagram = {
      owner: { _id: ownerId },
      members: [{ user: { _id: editorId.toHexString() }, role: "editor" }],
    };
    assert.equal(roleOf(diagram, ownerId.toHexString()), "owner");
    assert.equal(roleOf(diagram, { _id: editorId }), "editor");
    assert.equal(roleOf({ owner: ownerId.toHexString(), members: [] }, ownerId), "owner");
    assert.equal(roleOf({
      owner: ownerId,
      members: [{ user: viewerId.toHexString().toUpperCase(), role: "viewer" }],
    }, viewerId), "viewer");
  });

  it("returns null for a member whose role is not editor or viewer", () => {
    const diagram = {
      owner: ownerId,
      members: [
        { user: editorId, role: "admin" },
        { user: editorId, role: "editor" },
      ],
    };
    assert.equal(roleOf(diagram, editorId), null);
  });

  it("lets ownership win when the owner is also listed as a member", () => {
    const diagram = {
      owner: ownerId,
      members: [{ user: ownerId, role: "viewer" }],
    };
    assert.equal(roleOf(diagram, { _id: ownerId.toHexString() }), "owner");
  });

  it("returns null for bad input and does not throw", () => {
    const samples = [
      [null, ownerId],
      [undefined, ownerId],
      ["diagram", ownerId],
      [1, ownerId],
      [[], ownerId],
      [{ owner: ownerId }, null],
      [{ owner: ownerId }, undefined],
      [{ owner: ownerId }, ""],
      [{ owner: ownerId, members: null }, editorId],
      [{ owner: ownerId, members: "nope" }, editorId],
    ];
    for (const [diagram, userId] of samples) {
      assert.doesNotThrow(() => roleOf(diagram, userId));
      assert.equal(roleOf(diagram, userId), null);
    }
  });
});

describe("can", () => {
  for (const role of ["owner", "editor", "viewer"]) {
    for (const action of ACTIONS) {
      it(`${role} ${action}: ${TABLE[role][action]}`, () => {
        assert.equal(can(role, action), TABLE[role][action]);
      });
    }
  }

  it("denies an unknown role and an unknown action", () => {
    assert.equal(can("admin", "view"), false);
    assert.equal(can("owner", "checkout"), false);
    assert.equal(can(null, "view"), false);
    assert.equal(can("owner", "toString"), false);
    assert.equal(can("constructor", "view"), false);
  });
});

describe("parseDiagramId", () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("accepts a lowercase id and normalizes uppercase", () => {
    assert.equal(parseDiagramId(id), id);
    assert.equal(parseDiagramId(id.toUpperCase()), id);
    assert.equal(parseDiagramId("AaAaAaAa-BbBb-4CcC-8DdD-EeEeEeEeEeEe"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });

  it("rejects the wrong length, a non-string, and a leading space", () => {
    assert.equal(parseDiagramId(`${id.slice(0, -1)}`), null);
    assert.equal(parseDiagramId(`${id}f`), null);
    assert.equal(parseDiagramId(id.replace("-", "")), null);
    assert.equal(parseDiagramId(1), null);
    assert.equal(parseDiagramId(null), null);
    assert.equal(parseDiagramId(undefined), null);
    assert.equal(parseDiagramId({}), null);
    assert.equal(parseDiagramId(` ${id}`), null);
    assert.equal(parseDiagramId(`${id} `), null);
  });
});

describe("parseBaseRevision", () => {
  it("accepts 1 and rejects 0, -1, 1.5, a numeric string, and null", () => {
    assert.equal(parseBaseRevision(1), 1);
    assert.equal(parseBaseRevision(0), null);
    assert.equal(parseBaseRevision(-1), null);
    assert.equal(parseBaseRevision(1.5), null);
    assert.equal(parseBaseRevision("2"), null);
    assert.equal(parseBaseRevision(null), null);
    assert.equal(parseBaseRevision(undefined), null);
    assert.equal(parseBaseRevision(true), null);
  });
});

describe("parseDiagramBody", () => {
  it("rejects a body that is not a plain object", () => {
    for (const body of [null, undefined, [], "diagram", 1, new Date()]) {
      const parsed = parseDiagramBody(body);
      assert.deepEqual(parsed, { ok: false, status: 400, message: "Diagram data must be an object" });
    }
  });

  it("defaults a missing, null, or blank name and trims a real one", () => {
    for (const name of [undefined, null, "", "   "]) {
      const body = minimal();
      if (name !== undefined) body.name = name;
      const parsed = parseDiagramBody(body);
      assert.equal(parsed.ok, true, JSON.stringify(parsed));
      assert.equal(parsed.value.name, DEFAULT_DIAGRAM_NAME);
    }
    const trimmed = parseDiagramBody(minimal({ name: "  Billing  " }));
    assert.equal(trimmed.value.name, "Billing");
    assert.deepEqual(parseDiagramBody(minimal({ name: 1 })), {
      ok: false, status: 400, message: "Name must be text",
    });
    assert.equal(parseDiagramBody(minimal({ name: "a".repeat(DIAGRAM_NAME_MAX) })).value.name.length, 200);
    assert.deepEqual(parseDiagramBody(minimal({ name: ` ${"a".repeat(DIAGRAM_NAME_MAX)} ` })).ok, true);
    assert.deepEqual(parseDiagramBody(minimal({ name: "a".repeat(DIAGRAM_NAME_MAX + 1) })), {
      ok: false, status: 400, message: "Name must be 200 characters or fewer",
    });
  });

  it("defaults database and rejects anything outside the type pattern", () => {
    assert.equal(parseDiagramBody(minimal()).value.database, "generic");
    assert.equal(parseDiagramBody(minimal({ database: null })).value.database, "generic");
    assert.equal(parseDiagramBody(minimal({ database: "postgres" })).value.database, "postgres");
    assert.equal(parseDiagramBody(minimal({ database: "a".repeat(32) })).value.database, "a".repeat(32));
    assert.equal(parseDiagramBody(minimal({ database: "my_db1" })).value.database, "my_db1");
    for (const database of ["Postgres", "generic ", " mydb", "", "a".repeat(33), "my-db", 1, []]) {
      assert.deepEqual(parseDiagramBody(minimal({ database })), {
        ok: false, status: 400, message: "Unknown database type",
      });
    }
  });

  it("requires tables and references and defaults the other lists", () => {
    assert.deepEqual(parseDiagramBody({ references: [] }), {
      ok: false, status: 400, message: "tables must be a list",
    });
    assert.deepEqual(parseDiagramBody({ tables: null, references: [] }), {
      ok: false, status: 400, message: "tables must be a list",
    });
    assert.deepEqual(parseDiagramBody({ tables: {}, references: [] }), {
      ok: false, status: 400, message: "tables must be a list",
    });
    assert.deepEqual(parseDiagramBody({ tables: [] }), {
      ok: false, status: 400, message: "references must be a list",
    });
    assert.deepEqual(parseDiagramBody({ tables: [], references: "no" }), {
      ok: false, status: 400, message: "references must be a list",
    });

    const parsed = parseDiagramBody(minimal());
    const content = JSON.parse(parsed.value.content);
    for (const field of ["notes", "areas", "views", "enums", "types"]) {
      assert.deepEqual(content[field], []);
      assert.deepEqual(parseDiagramBody(minimal({ [field]: null })).ok, true);
      assert.deepEqual(JSON.parse(parseDiagramBody(minimal({ [field]: null })).value.content)[field], []);
      assert.deepEqual(parseDiagramBody(minimal({ [field]: "x" })), {
        ok: false, status: 400, message: `${field} must be a list`,
      });
    }
  });

  it("rejects a list element that is not a plain object", () => {
    for (const field of ["tables", "references", "notes", "areas", "views", "enums", "types"]) {
      for (const element of [null, [], 1, "row", new Date()]) {
        const body = minimal({ [field]: [element] });
        if (field === "tables") body.references = [];
        if (field === "references") body.tables = [];
        assert.deepEqual(parseDiagramBody(body), {
          ok: false, status: 400, message: `${field} must contain objects`,
        });
      }
    }
    const parsed = parseDiagramBody(minimal({
      tables: [{ z: 1, a: 2 }],
      references: [{}],
    }));
    assert.equal(parsed.ok, true);
    assert.deepEqual(Object.keys(JSON.parse(parsed.value.content).tables[0]), ["z", "a"]);
  });

  it("defaults sqlHeader, pan, and zoom, and rejects bad values", () => {
    const parsed = parseDiagramBody(minimal());
    const content = JSON.parse(parsed.value.content);
    assert.equal(content.sqlHeader, "");
    assert.deepEqual(content.pan, { x: 0, y: 0 });
    assert.equal(content.zoom, 1);
    assert.equal(JSON.parse(parseDiagramBody(minimal({ sqlHeader: null })).value.content).sqlHeader, "");
    assert.deepEqual(parseDiagramBody(minimal({ sqlHeader: 1 })), {
      ok: false, status: 400, message: "sqlHeader must be text",
    });
    assert.equal(JSON.parse(parseDiagramBody(minimal({ sqlHeader: "  keep  " })).value.content).sqlHeader, "  keep  ");

    assert.deepEqual(JSON.parse(parseDiagramBody(minimal({ pan: null })).value.content).pan, { x: 0, y: 0 });
    for (const pan of [[], { x: 1 }, { x: "1", y: 2 }, { x: Infinity, y: 0 }, { x: 1, y: Number.NaN }, 1]) {
      assert.deepEqual(parseDiagramBody(minimal({ pan })), {
        ok: false, status: 400, message: "pan must have numeric x and y",
      });
    }
    assert.deepEqual(JSON.parse(parseDiagramBody(minimal({ pan: { y: 4, x: 3, z: 9 } })).value.content).pan, { x: 3, y: 4 });

    assert.equal(JSON.parse(parseDiagramBody(minimal({ zoom: null })).value.content).zoom, 1);
    for (const zoom of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, "1", true]) {
      assert.deepEqual(parseDiagramBody(minimal({ zoom })), {
        ok: false, status: 400, message: "zoom must be a positive number",
      });
    }
    assert.equal(JSON.parse(parseDiagramBody(minimal({ zoom: 0.5 })).value.content).zoom, 0.5);
  });

  it("checks the body, name, database, lists, sqlHeader, pan, zoom, then size", () => {
    const cases = [
      [{ name: 1, database: "NO", tables: "no" }, "Name must be text"],
      [{ name: "ok", database: "NO", tables: [] }, "Unknown database type"],
      [{ database: "generic", references: [] }, "tables must be a list"],
      [{ tables: [], notes: [] }, "references must be a list"],
      [{ tables: [null], references: [] }, "tables must contain objects"],
      [{ tables: [], references: [[]], notes: "x" }, "references must contain objects"],
      [{ tables: [], references: [], notes: "x" }, "notes must be a list"],
      [{ tables: [], references: [], sqlHeader: 1, zoom: 0 }, "sqlHeader must be text"],
      [{ tables: [], references: [], pan: { x: 1 }, zoom: 0 }, "pan must have numeric x and y"],
      [{ tables: [], references: [], zoom: 0 }, "zoom must be a positive number"],
    ];
    for (const [body, message] of cases) {
      assert.equal(parseDiagramBody(body).message, message, JSON.stringify(body));
    }
  });

  it("keeps content keys in order and drops ignored fields", () => {
    const body = {
      name: "Billing",
      database: "postgres",
      tables: [{ name: "users" }],
      references: [],
      diagramId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      gistId: "gist",
      loadedFromGistId: "loaded",
      lastModified: "2000-01-01T00:00:00.000Z",
      baseRevision: 4,
      owner: "someone",
      extra: { no: true },
    };
    const before = JSON.stringify(body);
    const parsed = parseDiagramBody(body);
    assert.equal(JSON.stringify(body), before);
    assert.equal(parsed.ok, true);
    assert.deepEqual(Object.keys(parsed.value).sort(), ["content", "database", "name", "sizeBytes"]);
    const content = JSON.parse(parsed.value.content);
    assert.deepEqual(Object.keys(content), CONTENT_KEYS);
    assert.equal(content.diagramId, undefined);
    assert.equal(content.gistId, undefined);
    assert.equal(content.loadedFromGistId, undefined);
    assert.equal(content.lastModified, undefined);
    assert.equal(content.baseRevision, undefined);
    assert.equal(parsed.value.content, parseDiagramBody({
      name: "Billing",
      database: "postgres",
      tables: [{ name: "users" }],
      references: [],
    }).value.content);
  });

  it("accepts exactly 1 MiB and rejects one more byte, counting a multi-byte character", () => {
    const marker = "é";
    assert.equal(Buffer.byteLength(marker, "utf8"), 2);
    assert.equal(marker.length, 1);
    const marked = contentOf(marker);
    const pad = MAX_DIAGRAM_BYTES - Buffer.byteLength(marked, "utf8");
    assert.ok(pad > 0);
    const exactHeader = marker + "a".repeat(pad);
    const exactContent = contentOf(exactHeader);
    assert.equal(Buffer.byteLength(exactContent, "utf8"), MAX_DIAGRAM_BYTES);
    assert.notEqual(exactContent.length, Buffer.byteLength(exactContent, "utf8"));

    const exact = parseDiagramBody(minimal({ sqlHeader: exactHeader }));
    assert.equal(exact.ok, true);
    assert.equal(exact.value.content, exactContent);
    assert.equal(exact.value.sizeBytes, MAX_DIAGRAM_BYTES);

    const over = parseDiagramBody(minimal({ sqlHeader: `${exactHeader}a` }));
    assert.deepEqual(over, { ok: false, status: 413, message: "Diagram is too large" });
  });
});

describe("diagram shapes and storage math", () => {
  const updatedAt = new Date("2026-11-25T15:04:05.000Z");
  const diagram = {
    diagramId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    name: "Billing",
    database: "postgres",
    updatedAt,
    sizeBytes: 12,
    revision: 3,
    members: [{ user: editorId, role: "editor" }],
    content: JSON.stringify({
      tables: [{ name: "users" }],
      references: [],
      notes: [],
      areas: [],
      views: [],
      enums: [],
      types: [],
      sqlHeader: "",
      pan: { x: 2, y: 3 },
      zoom: 1,
    }),
  };

  it("shapes an owner and leaves a missing user null", () => {
    assert.equal(shapeOwner(null), null);
    assert.equal(shapeOwner(undefined), null);
    assert.deepEqual(shapeOwner({ _id: ownerId, username: "sam" }), {
      id: ownerId.toHexString(),
      username: "sam",
      email: "",
    });
    assert.deepEqual(shapeOwner({
      _id: ownerId.toHexString(),
      fullName: "",
      username: "sam",
      email: "sam@example.com",
    }), {
      id: ownerId.toHexString(),
      username: "sam",
      email: "sam@example.com",
    });
    assert.deepEqual(shapeOwner({
      _id: { _id: ownerId },
      fullName: "Sam",
      username: "s",
      email: "sam@example.com",
    }), {
      id: ownerId.toHexString(),
      username: "Sam",
      email: "sam@example.com",
    });
  });

  it("keeps content, members, and revision off a list item", () => {
    const item = shapeListItem(diagram, "editor", { _id: ownerId, fullName: "Owner", email: "o@example.com" });
    assert.equal(Object.hasOwn(item, "content"), false);
    assert.equal(Object.hasOwn(item, "members"), false);
    assert.equal(Object.hasOwn(item, "revision"), false);
    assert.deepEqual(item, {
      diagramId: diagram.diagramId,
      name: "Billing",
      database: "postgres",
      lastModified: "2026-11-25T15:04:05.000Z",
      sizeBytes: 12,
      role: "editor",
      owner: { id: ownerId.toHexString(), username: "Owner", email: "o@example.com" },
    });
  });

  it("sets canWrite from the edit permission and spreads the stored content", () => {
    for (const role of ["owner", "editor", "viewer"]) {
      const shaped = shapeDiagram(diagram, role, null);
      assert.equal(shaped.canWrite, can(role, "edit"));
      assert.equal(shaped.role, role);
      assert.equal(shaped.revision, 3);
      assert.deepEqual(shaped.tables, [{ name: "users" }]);
      assert.equal(shaped.owner, null);
      assert.equal(Object.hasOwn(shaped, "content"), false);
      assert.equal(Object.hasOwn(shaped, "members"), false);
    }
    assert.throws(() => shapeDiagram({ ...diagram, content: "{" }, "owner", null), SyntaxError);
    assert.throws(() => shapeDiagram({ ...diagram, content: "null" }, "owner", null), /Diagram content is invalid/);
    assert.throws(() => shapeDiagram({ ...diagram, content: "[]" }, "owner", null), /Diagram content is invalid/);
  });

  it("computes the bytes a write would use", () => {
    assert.equal(storageAfterWrite({ usedBytes: 10, oldBytes: 4, newBytes: 7 }), 13);
    assert.equal(fitsStorage(MAX_STORAGE_BYTES), true);
    assert.equal(fitsStorage(MAX_STORAGE_BYTES + 1), false);
  });
});

describe("Diagram schema", () => {
  it("keeps the member role enum equal to DIAGRAM_MEMBER_ROLES", () => {
    assert.deepEqual(
      Diagram.schema.path("members").schema.path("role").enumValues,
      DIAGRAM_MEMBER_ROLES,
    );
  });

  it("indexes diagramId as unique, plus owner and members.user", () => {
    assert.equal(Diagram.schema.path("diagramId").options.unique, true);
    assert.equal(Diagram.schema.path("owner").options.index, true);
    const indexes = Diagram.schema.indexes().map(([keys, options]) => [keys, options.unique === true]);
    assert.deepEqual(indexes, [
      [{ diagramId: 1 }, true],
      [{ owner: 1 }, false],
      [{ "members.user": 1 }, false],
    ]);
  });

  it("defaults revision and members", async () => {
    const diagram = new Diagram({
      diagramId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      owner: ownerId,
      name: "Billing",
      database: "generic",
      content: "{}",
      sizeBytes: 2,
    });
    await diagram.validate();
    assert.equal(diagram.revision, 1);
    assert.deepEqual(diagram.members.toObject(), []);
    assert.equal(diagram.members[0], undefined);
    await assert.rejects(
      new Diagram({
        diagramId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        owner: ownerId,
        name: "Billing",
        database: "generic",
        content: "{}",
        sizeBytes: 2,
        members: [{ user: editorId, role: "owner" }],
      }).validate(),
      (error) => {
        assert.ok(error.errors["members.0.role"]);
        return true;
      },
    );
  });
});

describe("server/src has no 402", () => {
  it("does not mention 402 anywhere under server/src", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../src");
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(root);
    const hits = files.filter((path) => readFileSync(path, "utf8").includes("402"));
    assert.deepEqual(hits, []);
  });
});
