import mongoose from "mongoose";
import Project from "../models/project.model.js";
import User from "../models/user.model.js";
import { MAX_PROJECT_SEATS, can, findProjectForMember, roleOf } from "../lib/projectAccess.js";
import {
  MESSAGES,
  compareOffers,
  findInvite,
  hasMember,
  idString,
  normalizeEmail,
  parseInviteBody,
  parseObjectId,
  parseRoleBody,
  seatsUsed,
  shapeInvite,
  shapeOfferedInvite,
  snapshotGuard,
} from "../lib/projectMembership.js";

// Every write below is one atomic update on a single Project document. The
// authorized read decides what to do; the write filter then repeats the
// authority it relied on (owner, member, or the exact invitation element) and
// the exact members/invites snapshot, so a request that lost a race matches
// nothing. A miss is never retried. It is classified by a fresh authorized
// read and answered with the specific error, or with the generic conflict.

const WRITE_OPTIONS = { returnDocument: "after", runValidators: true };

function fail(res, status, message) {
  return res.status(status).json({ message });
}

const projectNotFound = (res) => fail(res, 404, MESSAGES.projectNotFound);
const inviteNotFound = (res) => fail(res, 404, MESSAGES.inviteNotFound);
const memberNotFound = (res) => fail(res, 404, MESSAGES.memberNotFound);
const ownerOnly = (res) => fail(res, 403, MESSAGES.ownerOnly);
const conflict = (res) => fail(res, 400, MESSAGES.conflict);

// Scoped read for the project routes: malformed id, missing project and
// non-member are all the same 404, before any body or target is looked at.
async function readProject(req) {
  const projectId = parseObjectId(req.params.id);
  if (!projectId) return null;
  const project = await findProjectForMember(projectId, req.user._id);
  if (!project) return null;
  const role = roleOf(project, req.user._id);
  return role ? { project, role, projectId } : null;
}

// An invitation is authorized only by ONE invitations element that holds both
// the invite id and the caller's email. Matching them in different elements
// would let a second invite for the same person authorize someone else's.
function inviteScope(inviteId, email) {
  return { invites: { $elemMatch: { _id: inviteId, email } } };
}

async function readOffer(inviteId, email) {
  return Project.findOne(inviteScope(inviteId, email)).lean();
}

// The members' stored emails, compared in application code because
// User.email is case-sensitive storage and a lowercase lookup could miss a
// mixed-case address. Only rows for this project's own member ids are read.
async function memberEmails(project) {
  const ids = (project.members || []).map((member) => member.user);
  if (ids.length === 0) return new Set();
  const users = await User.find({ _id: { $in: ids } }).select("_id email").lean();
  const emails = new Set();
  for (const user of users) {
    const email = normalizeEmail(user?.email);
    if (email) emails.add(email);
  }
  return emails;
}

// Semantic rules for a new invitation, in the documented order.
async function inviteProblem(project, myEmail, email) {
  if (email === myEmail) return MESSAGES.self;
  if ((await memberEmails(project)).has(email)) return MESSAGES.alreadyMember;
  const pending = (project.invites || []).some((invite) => normalizeEmail(invite?.email) === email);
  if (pending) return MESSAGES.alreadyInvited;
  if (seatsUsed(project) >= MAX_PROJECT_SEATS) return MESSAGES.full;
  return null;
}

export async function createInvite(req, res) {
  const found = await readProject(req);
  if (!found) return projectNotFound(res);
  if (!can(found.role, "manage")) return ownerOnly(res);

  const parsed = parseInviteBody(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.message);
  const myEmail = normalizeEmail(req.user.email);
  if (!myEmail) return fail(res, 400, MESSAGES.accountEmail);

  const { project } = found;
  const { email, role } = parsed.value;
  const problem = await inviteProblem(project, myEmail, email);
  if (problem) return fail(res, 400, problem);

  const invite = {
    _id: new mongoose.Types.ObjectId(),
    email,
    role,
    invitedBy: req.user._id,
    createdAt: new Date(),
  };
  const saved = await Project.findOneAndUpdate(
    { _id: project._id, owner: req.user._id, ...snapshotGuard(project) },
    { $push: { invites: invite } },
    WRITE_OPTIONS,
  ).lean();

  if (saved) {
    const stored = findInvite(saved, idString(invite._id));
    if (!stored) return conflict(res);
    return res.status(201).json({ invite: shapeInvite(stored) });
  }

  const again = await readProject(req);
  if (!again) return projectNotFound(res);
  if (!can(again.role, "manage")) return ownerOnly(res);
  const reason = await inviteProblem(again.project, myEmail, email);
  return fail(res, 400, reason ?? MESSAGES.conflict);
}

export async function revokeInvite(req, res) {
  const found = await readProject(req);
  if (!found) return projectNotFound(res);
  if (!can(found.role, "manage")) return ownerOnly(res);

  const inviteId = parseObjectId(req.params.inviteId);
  if (!inviteId || !findInvite(found.project, inviteId)) return inviteNotFound(res);

  const { project } = found;
  const saved = await Project.findOneAndUpdate(
    { _id: project._id, owner: req.user._id, ...snapshotGuard(project) },
    { $pull: { invites: { _id: inviteId } } },
    WRITE_OPTIONS,
  ).lean();
  if (saved) return res.status(200).json({ message: "Invitation revoked" });

  const again = await readProject(req);
  if (!again) return projectNotFound(res);
  if (!can(again.role, "manage")) return ownerOnly(res);
  if (!findInvite(again.project, inviteId)) return inviteNotFound(res);
  return conflict(res);
}

export async function listMyInvites(req, res) {
  const email = normalizeEmail(req.user.email);
  if (!email) return fail(res, 400, MESSAGES.accountEmail);

  // Only the project's name and its invitations are read, never members, and
  // only elements addressed to this email are kept.
  const projects = await Project.find({ "invites.email": email }).select("_id name invites").lean();
  const offers = [];
  for (const project of projects) {
    for (const invite of project.invites || []) {
      if (normalizeEmail(invite?.email) !== email) continue;
      offers.push({ project, invite });
    }
  }

  const inviterIds = [...new Set(offers.map(({ invite }) => idString(invite.invitedBy)).filter(Boolean))];
  const inviters = new Map();
  if (inviterIds.length > 0) {
    const users = await User.find({ _id: { $in: inviterIds } }).select("_id fullName img").lean();
    for (const user of users) inviters.set(idString(user._id), user);
  }

  const invites = offers
    .map(({ project, invite }) => shapeOfferedInvite(project, invite, inviters.get(idString(invite.invitedBy))))
    .sort(compareOffers);
  res.status(200).json({ invites });
}

// Shared by accept and decline: id first (no project lookup for a malformed
// id), then the caller's email, then the single-element scoped read.
async function readOwnOffer(req) {
  const inviteId = parseObjectId(req.params.inviteId);
  if (!inviteId) return { status: "missing" };
  const email = normalizeEmail(req.user.email);
  if (!email) return { status: "email" };
  const project = await readOffer(inviteId, email);
  if (!project) return { status: "missing" };
  const invite = findInvite(project, inviteId);
  if (!invite || normalizeEmail(invite.email) !== email) return { status: "missing" };
  return { status: "ok", inviteId, email, project, invite };
}

function acceptProblem(project, me) {
  if (idString(project.owner) === idString(me)) return MESSAGES.ownerJoin;
  if (hasMember(project, idString(me))) return MESSAGES.youAreMember;
  // The offer being accepted already holds a seat, so a full project can
  // still accept it; only a corrupted, over-cap one is refused.
  if (seatsUsed(project) > MAX_PROJECT_SEATS) return MESSAGES.full;
  return null;
}

export async function acceptInvite(req, res) {
  const offer = await readOwnOffer(req);
  if (offer.status === "email") return fail(res, 400, MESSAGES.accountEmail);
  if (offer.status !== "ok") return inviteNotFound(res);

  const me = req.user._id;
  const { inviteId, email, project, invite } = offer;
  const problem = acceptProblem(project, me);
  if (problem) return fail(res, 400, problem);

  // The role comes from the stored invitation, never from the request.
  const saved = await Project.findOneAndUpdate(
    {
      _id: project._id,
      owner: { $ne: me },
      "members.user": { $ne: me },
      ...inviteScope(inviteId, email),
      ...snapshotGuard(project),
    },
    {
      $pull: { invites: { _id: inviteId } },
      $push: { members: { user: me, role: invite.role, addedAt: new Date() } },
    },
    WRITE_OPTIONS,
  ).lean();
  if (saved) return res.status(200).json({ projectId: idString(saved._id), role: invite.role });

  const again = await readOwnOffer(req);
  if (again.status !== "ok") return inviteNotFound(res);
  const reason = acceptProblem(again.project, me);
  return fail(res, 400, reason ?? MESSAGES.conflict);
}

export async function declineInvite(req, res) {
  const offer = await readOwnOffer(req);
  if (offer.status === "email") return fail(res, 400, MESSAGES.accountEmail);
  if (offer.status !== "ok") return inviteNotFound(res);

  const { inviteId, email, project } = offer;
  const saved = await Project.findOneAndUpdate(
    { _id: project._id, ...inviteScope(inviteId, email), ...snapshotGuard(project) },
    { $pull: { invites: { _id: inviteId } } },
    WRITE_OPTIONS,
  ).lean();
  if (saved) return res.status(200).json({ message: "Invitation declined" });

  const again = await readOwnOffer(req);
  if (again.status !== "ok") return inviteNotFound(res);
  return conflict(res);
}

export async function updateMemberRole(req, res) {
  const found = await readProject(req);
  if (!found) return projectNotFound(res);
  if (!can(found.role, "manage")) return ownerOnly(res);

  const targetId = parseObjectId(req.params.userId);
  if (!targetId) return memberNotFound(res);
  const parsed = parseRoleBody(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.message);
  const { project } = found;
  if (idString(project.owner) === targetId) return fail(res, 400, MESSAGES.ownerRole);
  if (!hasMember(project, targetId)) return memberNotFound(res);

  const { role } = parsed.value;
  const saved = await Project.findOneAndUpdate(
    {
      _id: project._id,
      owner: req.user._id,
      "members.user": targetId,
      ...snapshotGuard(project),
    },
    { $set: { "members.$[target].role": role } },
    { ...WRITE_OPTIONS, arrayFilters: [{ "target.user": new mongoose.Types.ObjectId(targetId) }] },
  ).lean();

  if (saved) {
    const member = (saved.members || []).find((item) => idString(item?.user) === targetId);
    if (!member) return conflict(res);
    return res.status(200).json({ member: { userId: targetId, role: member.role } });
  }

  const again = await readProject(req);
  if (!again) return projectNotFound(res);
  if (!can(again.role, "manage")) return ownerOnly(res);
  if (!hasMember(again.project, targetId)) return memberNotFound(res);
  return conflict(res);
}

export async function removeMember(req, res) {
  const found = await readProject(req);
  if (!found) return projectNotFound(res);

  const me = idString(req.user._id);
  const targetId = parseObjectId(req.params.userId);
  const owner = can(found.role, "manage");

  // Only the owner may touch someone else. Any other member is told so before
  // the existence of the target is revealed.
  if (!owner && targetId !== me) return ownerOnly(res);
  if (!targetId) return memberNotFound(res);
  if (owner && targetId === me) return fail(res, 400, MESSAGES.ownerLeave);
  if (!hasMember(found.project, targetId)) return owner ? memberNotFound(res) : projectNotFound(res);

  const { project } = found;
  const filter = owner
    ? { _id: project._id, owner: req.user._id, "members.user": targetId }
    : { _id: project._id, owner: { $ne: req.user._id }, "members.user": req.user._id };
  const saved = await Project.findOneAndUpdate(
    { ...filter, ...snapshotGuard(project) },
    { $pull: { members: { user: targetId } } },
    WRITE_OPTIONS,
  ).lean();
  if (saved) {
    return res.status(200).json({ message: owner ? "Member removed" : "Project left" });
  }

  const again = await readProject(req);
  if (!again) return projectNotFound(res);
  if (owner) {
    if (!can(again.role, "manage")) return ownerOnly(res);
    if (!hasMember(again.project, targetId)) return memberNotFound(res);
  } else if (!hasMember(again.project, targetId) || again.role === "owner") {
    return projectNotFound(res);
  }
  return conflict(res);
}
