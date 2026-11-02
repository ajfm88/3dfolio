import Project from "../models/project.model.js";
import Canvas from "../models/canvas.model.js";
import {
  MAX_OWNED_PROJECTS,
  can,
  findProjectForMember,
  parseProjectInput,
  roleOf,
} from "../lib/projectAccess.js";

const USER_FIELDS = "_id fullName img";
const ITEM_FIELDS = "name description owner members createdAt updatedAt";

function shapeUser(user) {
  if (!user || typeof user !== "object" || !user._id) return null;
  return {
    _id: user._id,
    fullName: user.fullName ?? "",
    img: user.img ?? "",
  };
}

function toItem(project, role) {
  const members = Array.isArray(project.members) ? project.members : [];
  return {
    _id: project._id,
    name: project.name,
    description: project.description,
    role,
    memberCount: members.length + 1,
    owner: shapeUser(project.owner),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function notFound(res) {
  return res.status(404).json({ message: "Project not found" });
}

function forbidden(res) {
  return res.status(403).json({ message: "Only the project owner can do that" });
}

export async function listProjects(req, res) {
  const me = req.user._id;
  const ownedDocs = await Project.find({ owner: me })
    .select(ITEM_FIELDS)
    .populate("owner", USER_FIELDS)
    .sort({ updatedAt: -1 })
    .lean();
  const sharedDocs = await Project.find({ "members.user": me, owner: { $ne: me } })
    .select(ITEM_FIELDS)
    .populate("owner", USER_FIELDS)
    .sort({ updatedAt: -1 })
    .lean();

  const owned = ownedDocs.map((project) => toItem(project, "owner"));
  const shared = [];
  for (const project of sharedDocs) {
    const role = roleOf(project, me);
    if (role === null) continue;
    shared.push(toItem(project, role));
  }

  res.status(200).json({ owned, shared });
}

export async function createProject(req, res) {
  const parsed = parseProjectInput(req.body, { partial: false });
  if (!parsed.ok) return res.status(400).json({ message: parsed.message });

  const me = req.user._id;
  const ownedCount = await Project.countDocuments({ owner: me });
  // Two creates at the same time can both pass this check while the count is
  // 19. That race is accepted: the cap is abuse protection, not an invariant.
  if (ownedCount >= MAX_OWNED_PROJECTS) {
    return res.status(400).json({ message: `You can own at most ${MAX_OWNED_PROJECTS} projects` });
  }

  const created = await Project.create({ ...parsed.value, owner: me });
  const doc = await Project.findById(created._id)
    .select(ITEM_FIELDS)
    .populate("owner", USER_FIELDS)
    .lean();

  res.status(201).json({ project: toItem(doc, "owner") });
}

export async function getProject(req, res) {
  const me = req.user._id;
  const project = await findProjectForMember(req.params.id, me);
  if (!project) return notFound(res);

  const role = roleOf(project, me);
  if (!role) return notFound(res);

  await Project.populate(project, [
    { path: "owner", select: USER_FIELDS },
    { path: "members.user", select: USER_FIELDS },
  ]);

  const members = [];
  for (const member of project.members || []) {
    const user = shapeUser(member?.user);
    if (!user) continue;
    members.push({ user, role: member.role, addedAt: member.addedAt });
  }

  const detail = {
    _id: project._id,
    name: project.name,
    description: project.description,
    owner: shapeUser(project.owner),
    members,
    ...(role === "owner"
      ? {
          invites: (project.invites || []).map((invite) => ({
            _id: invite._id,
            email: invite.email,
            role: invite.role,
            invitedBy: invite.invitedBy,
            createdAt: invite.createdAt,
          })),
        }
      : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };

  res.status(200).json({ project: detail, role });
}

export async function updateProject(req, res) {
  const me = req.user._id;
  const project = await findProjectForMember(req.params.id, me);
  if (!project) return notFound(res);
  if (!can(roleOf(project, me), "manage")) return forbidden(res);

  // After the access check, so a non-member cannot probe with validation text.
  const parsed = parseProjectInput(req.body, { partial: true });
  if (!parsed.ok) return res.status(400).json({ message: parsed.message });

  // owner stays in the filter after the manage check. Membership is part of
  // the query itself (invariant 2), not only the earlier read.
  const doc = await Project.findOneAndUpdate(
    { _id: project._id, owner: me },
    { $set: parsed.value },
    { returnDocument: "after", runValidators: true },
  )
    .select(ITEM_FIELDS)
    .populate("owner", USER_FIELDS)
    .lean();

  if (!doc) return notFound(res);
  res.status(200).json({ project: toItem(doc, "owner") });
}

export async function deleteProject(req, res) {
  const me = req.user._id;
  const project = await findProjectForMember(req.params.id, me);
  if (!project) return notFound(res);
  if (!can(roleOf(project, me), "manage")) return forbidden(res);

  const deleted = await Project.deleteOne({ _id: project._id, owner: me });
  if (deleted.deletedCount === 0) return notFound(res);

  // Project messages (S23) and kicking connected members (S27) join this
  // cascade later. A missing canvas is fine: it is created lazily on join.
  await Canvas.deleteOne({ project: project._id });

  res.status(200).json({ message: "Project deleted" });
}
