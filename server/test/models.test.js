import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Project from "../src/models/project.model.js";
import Canvas from "../src/models/canvas.model.js";
import { MEMBER_ROLES } from "../src/lib/projectAccess.js";

const owner = new mongoose.Types.ObjectId();
const member = new mongoose.Types.ObjectId();

function validProject(overrides = {}) {
  return new Project({
    name: " System design ",
    owner,
    members: [{ user: member, role: "editor" }],
    invites: [{ email: "  Sam@Example.COM ", role: "viewer", invitedBy: owner }],
    ...overrides,
  });
}

describe("Project schema", () => {
  it("accepts a valid document and supplies defaults", async () => {
    const project = validProject();
    await project.validate();
    assert.equal(project.name, "System design");
    assert.equal(project.description, "");
    assert.ok(project.members[0].addedAt instanceof Date);
    assert.ok(project.invites[0].createdAt instanceof Date);
    const empty = validProject({ members: undefined, invites: undefined });
    assert.deepEqual(empty.members.toObject(), []);
    assert.deepEqual(empty.invites.toObject(), []);
    assert.equal(Project.schema.options.timestamps, true);
  });

  for (const [field, value] of [
    ["name", undefined], ["name", "   "], ["name", "n".repeat(81)],
    ["description", "d".repeat(501)], ["owner", undefined],
  ]) {
    it(`rejects invalid ${field}: ${String(value).slice(0, 20)}`, async () => {
      await assert.rejects(validProject({ [field]: value }).validate(), (error) => {
        assert.ok(error.errors[field]);
        return true;
      });
    });
  }

  it("rejects owner as a member role and admin as an invite role", async () => {
    await assert.rejects(
      validProject({ members: [{ user: member, role: "owner" }] }).validate(),
      (error) => {
        assert.ok(error.errors["members.0.role"]);
        return true;
      },
    );
    await assert.rejects(
      validProject({ invites: [{ email: "sam@example.com", role: "admin", invitedBy: owner }] }).validate(),
      (error) => {
        assert.ok(error.errors["invites.0.role"]);
        return true;
      },
    );
  });

  it("normalizes invite emails and gives only invites a subdocument id", () => {
    const project = validProject();
    assert.equal(project.invites[0].email, "sam@example.com");
    assert.equal(project.members[0]._id, undefined);
    assert.ok(project.invites[0]._id instanceof mongoose.Types.ObjectId);
  });

  it("indexes ownership, member ids, and invite emails only", () => {
    assert.equal(Project.schema.path("owner").options.index, true);
    assert.deepEqual(Project.schema.indexes().map(([keys]) => keys), [
      { owner: 1 }, { "members.user": 1 }, { "invites.email": 1 },
    ]);
  });

  it("keeps both role enums equal to the access module's member roles", () => {
    for (const path of ["members", "invites"]) {
      assert.deepEqual(Project.schema.path(path).schema.path("role").enumValues, MEMBER_ROLES);
    }
  });
});

describe("Canvas schema", () => {
  it("defaults an untouched canvas without requiring an editor", async () => {
    const canvas = new Canvas({ project: new mongoose.Types.ObjectId() });
    await canvas.validate();
    assert.deepEqual(canvas.nodes.toObject(), []);
    assert.deepEqual(canvas.edges.toObject(), []);
    assert.equal(canvas.version, 0);
    assert.equal(canvas.updatedBy, undefined);
    assert.equal(Canvas.schema.options.timestamps, true);
  });

  it("requires a project and rejects a negative version", async () => {
    await assert.rejects(new Canvas().validate(), (error) => {
      assert.ok(error.errors.project);
      return true;
    });
    await assert.rejects(new Canvas({ project: owner, version: -1 }).validate(), (error) => {
      assert.ok(error.errors.version);
      return true;
    });
  });

  it("has only the unique project index", () => {
    assert.equal(Canvas.schema.path("project").options.unique, true);
    assert.deepEqual(Canvas.schema.indexes().map(([keys, options]) => [keys, options.unique]), [
      [{ project: 1 }, true],
    ]);
  });

  it("leaves canvas content validation to canvasOps", async () => {
    const nodes = [{ arbitrary: { value: [1, "two"] } }];
    const edges = [{ unrelated: true }];
    const canvas = new Canvas({ project: owner, nodes, edges });
    await canvas.validate();
    assert.deepEqual(canvas.nodes.toObject(), nodes);
    assert.deepEqual(canvas.edges.toObject(), edges);
  });
});
