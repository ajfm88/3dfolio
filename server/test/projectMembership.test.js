import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import Project from "../src/models/project.model.js";
import {
  EMAIL_MAX,
  compareOffers,
  findInvite,
  hasMember,
  normalizeEmail,
  parseInviteBody,
  parseObjectId,
  parseRole,
  parseRoleBody,
  seatsUsed,
  shapeInvite,
  shapeOfferedInvite,
  snapshotGuard,
} from "../src/lib/projectMembership.js";

const oid = () => new mongoose.Types.ObjectId();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

describe("parseObjectId", () => {
  it("accepts only 24-hex strings and canonicalizes to lowercase", () => {
    const id = oid().toHexString();
    assert.equal(parseObjectId(id), id);
    assert.equal(parseObjectId(id.toUpperCase()), id);
    for (const bad of ["", "abc", "123456789012", "z".repeat(24), `${id}0`, null, undefined, 5, [id], { id }, oid()]) {
      assert.equal(parseObjectId(bad), null, String(bad));
    }
  });
});

describe("normalizeEmail", () => {
  it("trims outer whitespace, lowercases, and keeps plus tags and dots", () => {
    assert.equal(normalizeEmail("  Ada.Lovelace+Notes@Example.COM \n"), "ada.lovelace+notes@example.com");
    assert.equal(normalizeEmail("a@b.co"), "a@b.co");
  });

  it("does not equate provider aliases", () => {
    assert.notEqual(normalizeEmail("a.b@gmail.com"), normalizeEmail("ab@gmail.com"));
    assert.notEqual(normalizeEmail("a+x@gmail.com"), normalizeEmail("a@gmail.com"));
  });

  it("rejects malformed addresses, control characters and non-strings", () => {
    for (const bad of ["", "   ", "plain", "a@b", "a@@b.co", "a b@c.co", "a@c .co", "@b.co", "a\u0000@b.co", "a@b.co\u007f", "a\tb@c.co"]) {
      assert.equal(normalizeEmail(bad), null, JSON.stringify(bad));
    }
    for (const bad of [null, undefined, 5, true, ["a@b.co"], { email: "a@b.co" }, { $ne: "x" }]) {
      assert.equal(normalizeEmail(bad), null, String(bad));
    }
  });

  it("allows exactly 254 characters", () => {
    const domain = "@x.co";
    const edge = `${"a".repeat(EMAIL_MAX - domain.length)}${domain}`;
    assert.equal(edge.length, EMAIL_MAX);
    assert.equal(normalizeEmail(edge), edge);
    assert.equal(normalizeEmail(`a${edge}`), null);
  });
});

describe("body parsers", () => {
  it("reads only email and role and ignores everything else", () => {
    const body = {
      email: " X@Y.co ",
      role: "editor",
      invitedBy: "1",
      owner: "2",
      members: [],
      invites: [],
      _id: "3",
      user: "4",
      createdAt: "5",
      projectId: "6",
    };
    const parsed = parseInviteBody(body);
    assert.deepEqual(parsed, { ok: true, value: { email: "x@y.co", role: "editor" } });
    assert.deepEqual(parseRoleBody({ role: "viewer", user: "x", addedAt: "y" }), { ok: true, value: { role: "viewer" } });
  });

  it("reports the email before the role and never coerces", () => {
    const email = "Email must be a valid address";
    const role = "Role must be editor or viewer";
    assert.deepEqual(parseInviteBody({}), { ok: false, message: email });
    assert.deepEqual(parseInviteBody(null), { ok: false, message: email });
    assert.deepEqual(parseInviteBody([]), { ok: false, message: email });
    assert.deepEqual(parseInviteBody("a@b.co"), { ok: false, message: email });
    assert.deepEqual(parseInviteBody({ email: "a@b.co", role: ["viewer"] }), { ok: false, message: role });
    assert.deepEqual(parseInviteBody({ email: "bad", role: "owner" }), { ok: false, message: email });
    for (const bad of [undefined, null, "owner", "admin", "Editor", " viewer", 1, { $ne: "x" }]) {
      assert.equal(parseRole(bad), null, String(bad));
      assert.deepEqual(parseRoleBody({ role: bad }), { ok: false, message: role });
    }
    assert.deepEqual(parseRoleBody(null), { ok: false, message: role });
    assert.deepEqual(parseRoleBody([]), { ok: false, message: role });
  });

  it("does not mutate its input", () => {
    const body = deepFreeze({ email: " A@B.co ", role: "viewer", extra: { a: 1 } });
    assert.equal(parseInviteBody(body).ok, true);
    assert.equal(body.email, " A@B.co ");
  });
});

describe("response shaping", () => {
  const invite = {
    _id: oid(),
    email: "a@b.co",
    role: "viewer",
    invitedBy: oid(),
    createdAt: new Date("2026-11-12T10:00:00.000Z"),
    __v: 3,
    secret: "no",
  };

  it("shapes an invite to exactly five fields with canonical strings", () => {
    const shaped = shapeInvite(invite);
    assert.deepEqual(Object.keys(shaped), ["_id", "email", "role", "invitedBy", "createdAt"]);
    assert.equal(shaped._id, invite._id.toHexString());
    assert.equal(shaped.invitedBy, invite.invitedBy.toHexString());
    assert.equal(shaped.createdAt, "2026-11-12T10:00:00.000Z");
  });

  it("shapes an offered invite without roster, emails or Mongoose fields", () => {
    const project = { _id: oid(), name: "Design", members: [{ user: oid() }], invites: [invite], owner: oid() };
    const inviter = { _id: oid(), fullName: "Ada", img: "a.png", email: "ada@x.co", clerkId: "clerk_1" };
    const shaped = shapeOfferedInvite(project, invite, inviter);
    assert.deepEqual(Object.keys(shaped), ["_id", "project", "role", "invitedBy", "createdAt"]);
    assert.deepEqual(Object.keys(shaped.project), ["_id", "name"]);
    assert.deepEqual(Object.keys(shaped.invitedBy), ["_id", "fullName", "img"]);
    assert.equal(shaped._id, invite._id.toHexString(), "the invitation id, not the project id");
    assert.equal(shapeOfferedInvite(project, invite, undefined).invitedBy, null);
    assert.equal(JSON.stringify(shaped).includes("clerk_1"), false);
  });

  it("orders newest first with invitation id descending for ties", () => {
    const rows = [
      { _id: "a1", createdAt: "2026-11-12T10:00:00.000Z" },
      { _id: "b2", createdAt: "2026-11-12T10:00:00.000Z" },
      { _id: "c3", createdAt: "2026-11-13T10:00:00.000Z" },
      { _id: "d4", createdAt: "2026-11-01T10:00:00.000Z" },
    ];
    assert.deepEqual(rows.sort(compareOffers).map((row) => row._id), ["c3", "b2", "a1", "d4"]);
  });

  it("counts seats, finds invites and members", () => {
    const user = oid();
    const first = oid();
    const project = { members: [{ user }], invites: [{ _id: first }, { _id: oid() }] };
    assert.equal(seatsUsed(project), 3);
    assert.equal(seatsUsed({}), 0);
    assert.ok(findInvite(project, first.toHexString()));
    assert.equal(findInvite(project, oid().toHexString()), null);
    assert.equal(hasMember(project, user.toHexString()), true);
    assert.equal(hasMember(project, oid().toHexString()), false);
    assert.equal(hasMember({}, user.toHexString()), false);
  });
});

describe("snapshotGuard", () => {
  const owner = oid();
  const member = { user: oid(), role: "editor", addedAt: new Date("2026-11-10T09:00:00.000Z") };
  const pending = {
    _id: oid(),
    email: "a@b.co",
    role: "viewer",
    invitedBy: owner,
    createdAt: new Date("2026-11-12T10:00:00.000Z"),
  };

  it("describes empty arrays as size zero and filled arrays as size plus one element each", () => {
    assert.deepEqual(snapshotGuard({ members: [], invites: [] }).$and, [
      { members: { $size: 0 } },
      { invites: { $size: 0 } },
    ]);
    const guard = snapshotGuard({ members: [member], invites: [pending] });
    assert.deepEqual(guard.$and.map((part) => Object.keys(part)[0]), ["members", "members", "invites", "invites"]);
    assert.deepEqual(guard.$and[0], { members: { $size: 1 } });
    assert.deepEqual(guard.$and[1].members.$all, [{ $elemMatch: { user: member.user, role: "editor", addedAt: member.addedAt } }]);
    assert.equal(guard.$and[3].invites.$all[0].$elemMatch._id, pending._id);
  });

  it("keeps ObjectIds and Dates as values and never serializes them", () => {
    const guard = snapshotGuard({ members: [member], invites: [pending] });
    const element = guard.$and[1].members.$all[0].$elemMatch;
    assert.ok(element.user instanceof mongoose.Types.ObjectId);
    assert.ok(element.addedAt instanceof Date);
    assert.ok(guard.$and[3].invites.$all[0].$elemMatch.invitedBy instanceof mongoose.Types.ObjectId);
  });

  it("does not mutate the snapshot it was built from and tolerates missing arrays", () => {
    const project = deepFreeze({ members: [member], invites: [pending] });
    assert.doesNotThrow(() => snapshotGuard(project));
    assert.deepEqual(snapshotGuard({}).$and, [{ members: { $size: 0 } }, { invites: { $size: 0 } }]);
  });

  it("is order independent: a reordered array yields the same element conditions", () => {
    const other = { user: oid(), role: "viewer", addedAt: new Date("2026-11-11T09:00:00.000Z") };
    const forward = snapshotGuard({ members: [member, other], invites: [] }).$and[1].members.$all;
    const reversed = snapshotGuard({ members: [other, member], invites: [] }).$and[1].members.$all;
    assert.deepEqual(new Set(forward.map((part) => part.$elemMatch.user.toHexString())), new Set(reversed.map((part) => part.$elemMatch.user.toHexString())));
  });
});

// A no-I/O check through the real Project schema. Query casting runs without a
// connection, so this proves the filters and updates the handlers send keep
// their types under the installed Mongoose. It is not a database test.
describe("real Project schema casting", () => {
  function cast(filter) {
    const query = Project.findOne(filter);
    query.cast(Project);
    return query.getFilter();
  }

  it("casts the snapshot guard with ObjectIds, Dates and empty arrays intact", () => {
    const user = oid();
    const addedAt = new Date("2026-11-10T09:00:00.000Z");
    const inviteId = oid();
    const createdAt = new Date("2026-11-12T10:00:00.000Z");
    const project = {
      members: [{ user, role: "editor", addedAt }],
      invites: [{ _id: inviteId, email: "A@B.co", role: "viewer", invitedBy: user, createdAt }],
    };
    const filter = cast({ _id: oid().toHexString(), owner: oid().toHexString(), ...snapshotGuard(project) });
    assert.ok(filter._id instanceof mongoose.Types.ObjectId);
    assert.ok(filter.owner instanceof mongoose.Types.ObjectId);
    const members = filter.$and[1].members.$all[0].$elemMatch;
    assert.equal(members.user.toHexString(), user.toHexString());
    assert.equal(members.addedAt.getTime(), addedAt.getTime());
    assert.equal(members.role, "editor");
    const invites = filter.$and[3].invites.$all[0].$elemMatch;
    assert.equal(invites._id.toHexString(), inviteId.toHexString());
    assert.equal(invites.createdAt.getTime(), createdAt.getTime());
    assert.equal(invites.email, "a@b.co", "the schema lowercases the address");

    const empty = cast({ ...snapshotGuard({ members: [], invites: [] }) });
    assert.deepEqual(empty.$and, [{ members: { $size: 0 } }, { invites: { $size: 0 } }]);
  });

  it("casts the single-element invitation scope and the user filters", () => {
    const inviteId = oid();
    const filter = cast({ invites: { $elemMatch: { _id: inviteId.toHexString(), email: "Me@X.co" } }, "members.user": { $ne: oid().toHexString() } });
    assert.ok(filter.invites.$elemMatch._id instanceof mongoose.Types.ObjectId);
    assert.equal(filter.invites.$elemMatch.email, "me@x.co");
    assert.ok(filter["members.user"].$ne instanceof mongoose.Types.ObjectId);
  });

  it("casts the positional role update and its array filter", () => {
    const target = oid();
    const query = Project.findOneAndUpdate(
      { _id: oid() },
      { $set: { "members.$[target].role": "viewer" } },
      { arrayFilters: [{ "target.user": target }], runValidators: true },
    );
    assert.deepEqual(query.getUpdate(), { $set: { "members.$[target].role": "viewer" } });
    assert.ok(query.getOptions().arrayFilters[0]["target.user"] instanceof mongoose.Types.ObjectId);
  });

  it("leaves the model defaults and indexes unchanged", () => {
    assert.deepEqual(Project.schema.path("members").defaultValue(), []);
    assert.deepEqual(Project.schema.path("invites").defaultValue(), []);
    const paths = Project.schema.indexes().map(([fields]) => Object.keys(fields).join());
    for (const path of ["owner", "members.user", "invites.email"]) assert.ok(paths.includes(path), path);
  });
});
