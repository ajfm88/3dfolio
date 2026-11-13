import mongoose from "mongoose";
import { MAX_PROJECT_SEATS, MEMBER_ROLES } from "./projectAccess.js";

// Validation, normalization and response shaping for the S26 membership
// routes. Authorization stays in projectAccess.js (roleOf and can); nothing in
// this file decides who may do what. It does no I/O and touches no clock.

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ASCII control characters, including DEL. They would survive a trim in the
// middle of an address and are never part of a real one.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
export const EMAIL_MAX = 254;

export const MESSAGES = Object.freeze({
  email: "Email must be a valid address",
  role: "Role must be editor or viewer",
  accountEmail: "Your account needs a valid email address",
  self: "You cannot invite yourself",
  alreadyMember: "This person is already a member",
  alreadyInvited: "This email is already invited",
  full: `A project can have at most ${MAX_PROJECT_SEATS} members and pending invites`,
  ownerRole: "Owner role cannot be changed",
  ownerLeave: "Owner cannot leave the project",
  ownerJoin: "Owner cannot join as a member",
  youAreMember: "You are already a member",
  conflict: "Project membership changed. Please try again.",
  projectNotFound: "Project not found",
  inviteNotFound: "Invitation not found",
  memberNotFound: "Member not found",
  ownerOnly: "Only the project owner can do that",
});

// Lowercase hex string or null. mongoose.isValidObjectId also accepts any
// 12-character string and numbers, so the format is checked explicitly and the
// value is never coerced.
export function parseObjectId(value) {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) return null;
  if (!mongoose.isValidObjectId(value)) return null;
  return value.toLowerCase();
}

// Primitive strings only: arrays, objects, numbers and null are not coerced.
export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX) return null;
  if (CONTROL.test(email) || !EMAIL.test(email)) return null;
  return email;
}

export function parseRole(value) {
  return typeof value === "string" && MEMBER_ROLES.includes(value) ? value : null;
}

function isRecord(body) {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

// Only email and role are read. A key such as invitedBy, owner, members or
// _id is ignored, never merged. The email error comes first for a body that is
// not an object, as the spec says.
export function parseInviteBody(body) {
  const source = isRecord(body) ? body : {};
  const email = normalizeEmail(Object.hasOwn(source, "email") ? source.email : undefined);
  if (email === null) return { ok: false, message: MESSAGES.email };
  const role = parseRole(Object.hasOwn(source, "role") ? source.role : undefined);
  if (role === null) return { ok: false, message: MESSAGES.role };
  return { ok: true, value: { email, role } };
}

export function parseRoleBody(body) {
  const source = isRecord(body) ? body : {};
  const role = parseRole(Object.hasOwn(source, "role") ? source.role : undefined);
  if (role === null) return { ok: false, message: MESSAGES.role };
  return { ok: true, value: { role } };
}

export function idString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value.toHexString === "function") return value.toHexString();
  if (value._id !== undefined) return idString(value._id);
  return String(value).toLowerCase();
}

export function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// The exact Invite resource: no Mongoose internals, no populated users.
export function shapeInvite(invite) {
  return {
    _id: idString(invite._id),
    email: invite.email,
    role: invite.role,
    invitedBy: idString(invite.invitedBy),
    createdAt: isoDate(invite.createdAt),
  };
}

export function shapeInviter(user) {
  if (!user || typeof user !== "object" || !user._id) return null;
  return {
    _id: idString(user._id),
    fullName: typeof user.fullName === "string" ? user.fullName : "",
    img: typeof user.img === "string" ? user.img : "",
  };
}

// What an invitee may see: the offer, the project's id and name, and who
// invited them. No roster, other invitations, emails of other people or canvas.
export function shapeOfferedInvite(project, invite, inviter) {
  return {
    _id: idString(invite._id),
    project: { _id: idString(project._id), name: project.name },
    role: invite.role,
    invitedBy: shapeInviter(inviter),
    createdAt: isoDate(invite.createdAt),
  };
}

// Newest first, then invitation id descending so ties are stable.
export function compareOffers(left, right) {
  const delta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (delta !== 0) return delta;
  if (left._id < right._id) return 1;
  if (left._id > right._id) return -1;
  return 0;
}

export function seatsUsed(project) {
  const members = Array.isArray(project.members) ? project.members.length : 0;
  const invites = Array.isArray(project.invites) ? project.invites.length : 0;
  return members + invites;
}

export function findInvite(project, inviteId) {
  if (!Array.isArray(project.invites)) return null;
  return project.invites.find((invite) => idString(invite?._id) === inviteId) ?? null;
}

export function hasMember(project, userId) {
  if (!Array.isArray(project.members)) return false;
  return project.members.some((member) => idString(member?.user) === userId);
}

// Membership snapshot compare-and-swap. The write filter must describe the
// exact members and invites arrays the decision was made from, so a request
// that raced a newer change matches nothing instead of overwriting it.
//
// Each array is matched by size plus one $elemMatch per element. That is exact
// equality of the element set without depending on subdocument field order,
// which a literal array comparison would, and it keeps ObjectIds and Dates as
// the values they are (never serialized). An empty array is { $size: 0 }.
// Elements are unique (members by user, invites by _id), so equal size plus
// every element present means the same elements. A time-only updatedAt guard
// is deliberately not used: it collides, and a rename must not block a
// membership change.
function elementGuard(path, items, pick) {
  const list = Array.isArray(items) ? items : [];
  const clauses = [{ [path]: { $size: list.length } }];
  if (list.length > 0) {
    clauses.push({ [path]: { $all: list.map((item) => ({ $elemMatch: pick(item) })) } });
  }
  return clauses;
}

function defined(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

export function snapshotGuard(project) {
  return {
    $and: [
      ...elementGuard("members", project.members, (member) => defined({
        user: member.user,
        role: member.role,
        addedAt: member.addedAt,
      })),
      ...elementGuard("invites", project.invites, (invite) => defined({
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        invitedBy: invite.invitedBy,
        createdAt: invite.createdAt,
      })),
    ],
  };
}
