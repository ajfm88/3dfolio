import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Project from "../src/models/project.model.js";
import {
  can,
  roleOf,
  findProjectForMember,
  parseProjectInput,
  MEMBER_ROLES,
  MAX_OWNED_PROJECTS,
  MAX_PROJECT_SEATS,
  PROJECT_NAME_MAX,
  PROJECT_DESCRIPTION_MAX,
} from "../src/lib/projectAccess.js";

const owner = new mongoose.Types.ObjectId();
const editor = new mongoose.Types.ObjectId();
const viewer = new mongoose.Types.ObjectId();
const outsider = new mongoose.Types.ObjectId();
const roles = ["owner", "editor", "viewer"];
const permissions = {
  view: [true, true, true],
  chat: [true, true, true],
  edit: [true, true, false],
  reclaim: [true, false, false],
  manage: [true, false, false],
  leave: [false, true, true],
};

describe("can", () => {
  for (const [action, expected] of Object.entries(permissions)) {
    for (const [index, role] of roles.entries()) {
      it(`${role} ${action}: ${expected[index]}`, () => {
        assert.equal(can(role, action), expected[index]);
      });
    }
  }

  it("denies unknown roles for every action", () => {
    for (const role of [null, undefined, "admin", "Owner", "toString", "__proto__"]) {
      for (const action of Object.keys(permissions)) assert.equal(can(role, action), false);
    }
  });

  it("denies unknown and inherited actions", () => {
    for (const action of ["delete", "toString", "__proto__", null, undefined]) {
      assert.equal(can("owner", action), false);
    }
  });
});

function projectWithIds(transform = (id) => id) {
  return {
    owner: transform(owner),
    members: [
      { user: transform(editor), role: "editor" },
      { user: transform(viewer), role: "viewer" },
    ],
  };
}

describe("roleOf", () => {
  for (const [format, stored, supplied] of [
    ["ObjectIds", (id) => id, (id) => id],
    ["stored strings and supplied ObjectIds", String, (id) => id],
    ["stored ObjectIds and supplied strings", (id) => id, String],
    ["populated objects", (id) => ({ _id: id, fullName: "Sam" }), (id) => id],
  ]) {
    it(`resolves all roles with ${format}`, () => {
      const project = projectWithIds(stored);
      for (const [index, id] of [owner, editor, viewer].entries()) {
        assert.equal(roleOf(project, supplied(id)), roles[index]);
      }
    });
  }

  it("accepts hydrated documents without mutating them", () => {
    const project = new Project({ name: "Design", ...projectWithIds() });
    const before = project.toObject();
    for (const [index, id] of [owner, editor, viewer].entries()) {
      assert.equal(roleOf(project, id), roles[index]);
    }
    assert.deepEqual(project.toObject(), before);
  });

  it("returns null for non-members", () => {
    assert.equal(roleOf(projectWithIds(), outsider), null);
  });

  it("never matches non-id values as owners or members", () => {
    for (const [stored, supplied] of [
      [{}, {}],
      [new Date(0), new Date(0)],
      [5, 5],
      [{ _id: null }, "null"],
      [[], []],
      [{ _id: 5 }, "5"],
    ]) {
      assert.equal(roleOf({ owner: stored }, supplied), null);
      assert.equal(roleOf({ owner, members: [{ user: stored, role: "editor" }] }, supplied), null);
    }
  });

  it("gives ownership priority over a stray viewer entry", () => {
    assert.equal(roleOf({ owner, members: [{ user: owner, role: "viewer" }] }, owner), "owner");
  });

  it("uses the first matching member even when its role is invalid", () => {
    for (const [firstRole, expected] of [["viewer", "viewer"], ["admin", null]]) {
      assert.equal(roleOf({
        owner,
        members: [{ user: editor, role: firstRole }, { user: editor, role: "editor" }],
      }, editor), expected);
    }
  });

  it("rejects missing projects and user ids", () => {
    for (const project of [null, undefined, "project"]) assert.equal(roleOf(project, owner), null);
    for (const id of [null, undefined, ""]) assert.equal(roleOf(projectWithIds(), id), null);
  });

  it("tolerates missing and malformed members", () => {
    assert.equal(roleOf({ owner }, editor), null);
    for (const members of [null, {}, "members", [null, {}]]) {
      assert.equal(roleOf({ owner, members }, editor), null);
    }
  });

  it("does not mutate lean inputs", () => {
    const project = Object.freeze({
      owner: String(owner),
      members: Object.freeze([Object.freeze({ user: String(editor), role: "editor" })]),
    });
    assert.equal(roleOf(project, editor), "editor");
  });
});

describe("findProjectForMember", () => {
  it("returns null for invalid ids without querying", async () => {
    const find = mock.method(Project, "findOne", () => {
      assert.fail("Invalid ids must never reach a query");
    });
    try {
      for (const invalid of ["not-an-id", "aaaaaaaaaaaa", null, {}, 123]) {
        assert.equal(await findProjectForMember(invalid, owner), null);
        assert.equal(await findProjectForMember(owner, invalid), null);
      }
      assert.equal(find.mock.callCount(), 0);
    } finally {
      find.mock.restore();
    }
  });
});

it("exports the project limits and member roles defined in the architecture", () => {
  assert.deepEqual(MEMBER_ROLES, ["editor", "viewer"]);
  assert.equal(MAX_OWNED_PROJECTS, 20);
  assert.equal(MAX_PROJECT_SEATS, 10);
  assert.equal(PROJECT_NAME_MAX, 80);
  assert.equal(PROJECT_DESCRIPTION_MAX, 500);
});

describe("parseProjectInput", () => {
  const untitled = { name: "Untitled project", description: "" };
  const nameLimit = `Name must be ${PROJECT_NAME_MAX} characters or fewer`;
  const descriptionLimit = `Description must be ${PROJECT_DESCRIPTION_MAX} characters or fewer`;

  function snapshot(body) {
    if (body === null || typeof body !== "object") return body;
    return structuredClone(body);
  }

  describe("create (partial: false)", () => {
    for (const body of [undefined, null, [], "x", {}]) {
      it(`defaults ${JSON.stringify(body)} to an untitled project`, () => {
        assert.deepEqual(parseProjectInput(body, { partial: false }), { ok: true, value: untitled });
      });
    }

    it("turns a blank name into Untitled project", () => {
      assert.deepEqual(parseProjectInput({ name: "   " }, { partial: false }), {
        ok: true,
        value: untitled,
      });
    });

    it("trims a provided name", () => {
      assert.deepEqual(parseProjectInput({ name: "  Infra  " }, { partial: false }), {
        ok: true,
        value: { name: "Infra", description: "" },
      });
    });

    it("accepts a name at the limit and rejects one past it", () => {
      const maxName = "n".repeat(PROJECT_NAME_MAX);
      assert.deepEqual(parseProjectInput({ name: maxName }, { partial: false }), {
        ok: true,
        value: { name: maxName, description: "" },
      });
      assert.deepEqual(parseProjectInput({ name: `${maxName}x` }, { partial: false }), {
        ok: false,
        message: nameLimit,
      });
    });

    it("measures the name after trimming", () => {
      const maxName = "n".repeat(PROJECT_NAME_MAX);
      assert.deepEqual(parseProjectInput({ name: `  ${maxName}  ` }, { partial: false }), {
        ok: true,
        value: { name: maxName, description: "" },
      });
    });

    it("accepts a description at the limit and rejects one past it", () => {
      const maxDescription = "d".repeat(PROJECT_DESCRIPTION_MAX);
      assert.equal(
        parseProjectInput({ description: maxDescription }, { partial: false }).value.description,
        maxDescription,
      );
      assert.deepEqual(
        parseProjectInput({ description: `${maxDescription}x` }, { partial: false }),
        { ok: false, message: descriptionLimit },
      );
    });

    it("rejects non-string name and description", () => {
      for (const name of [5, null]) {
        assert.deepEqual(parseProjectInput({ name }, { partial: false }), {
          ok: false,
          message: "Name must be text",
        });
      }
      for (const description of [{}, null]) {
        assert.deepEqual(parseProjectInput({ description }, { partial: false }), {
          ok: false,
          message: "Description must be text",
        });
      }
    });

    it("drops keys other than name and description", () => {
      const result = parseProjectInput({
        name: "Infra",
        description: " notes ",
        owner: outsider,
        members: [{ user: editor, role: "editor" }],
        invites: [{ email: "a@example.com" }],
        _id: outsider,
      }, { partial: false });
      assert.deepEqual(result, {
        ok: true,
        value: { name: "Infra", description: "notes" },
      });
    });
  });

  describe("update (partial: true)", () => {
    for (const body of [{}, undefined]) {
      it(`rejects ${body === undefined ? "undefined" : "an empty object"}`, () => {
        assert.deepEqual(parseProjectInput(body, { partial: true }), {
          ok: false,
          message: "Nothing to update",
        });
      });
    }

    it("returns only the field that was sent", () => {
      assert.deepEqual(parseProjectInput({ name: "  Infra  " }, { partial: true }), {
        ok: true,
        value: { name: "Infra" },
      });
      assert.deepEqual(parseProjectInput({ description: "  notes  " }, { partial: true }), {
        ok: true,
        value: { description: "notes" },
      });
    });

    it("rejects a blank name", () => {
      assert.deepEqual(parseProjectInput({ name: "   " }, { partial: true }), {
        ok: false,
        message: "Name can't be empty",
      });
    });

    it("allows an empty description, which clears it", () => {
      assert.deepEqual(parseProjectInput({ description: "" }, { partial: true }), {
        ok: true,
        value: { description: "" },
      });
    });

    it("ignores extra keys, and a body of only extra keys updates nothing", () => {
      assert.deepEqual(parseProjectInput({
        name: "Infra",
        owner: outsider,
        members: [],
        invites: [],
        _id: outsider,
      }, { partial: true }), {
        ok: true,
        value: { name: "Infra" },
      });
      assert.deepEqual(parseProjectInput({
        owner: outsider,
        members: [],
        invites: [],
        _id: outsider,
      }, { partial: true }), {
        ok: false,
        message: "Nothing to update",
      });
    });
  });

  it("does not mutate its input and never throws", () => {
    const bodies = [
      undefined,
      null,
      [],
      "x",
      {},
      { name: "  Infra  ", description: "  notes  ", owner: "nope", members: [{ user: "a" }] },
      Object.freeze({ name: "  Infra  ", description: "  d  ", owner: "x", members: Object.freeze([]), invites: Object.freeze([]), _id: "id" }),
    ];
    for (const body of bodies) {
      const before = snapshot(body);
      assert.doesNotThrow(() => parseProjectInput(body, { partial: false }));
      assert.doesNotThrow(() => parseProjectInput(body, { partial: true }));
      if (body !== null && typeof body === "object") assert.deepEqual(body, before);
    }
  });
});
