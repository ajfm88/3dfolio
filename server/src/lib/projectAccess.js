import mongoose from "mongoose";
import Project from "../models/project.model.js";

// roleOf and can are pure and safe to call anywhere. findProjectForMember is
// the only function here with I/O, keeping access decisions separate from reads.
export const MEMBER_ROLES = ["editor", "viewer"];
export const MAX_OWNED_PROJECTS = 20;
export const MAX_PROJECT_SEATS = 10; // Members + pending invites, excluding the owner.
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 500;

function idString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
    if (typeof value === "object" && !Array.isArray(value)) {
      const id = value._id;
      if (typeof id === "string") return id;
      if (id instanceof mongoose.Types.ObjectId) return id.toHexString();
    }
    return null;
  } catch {
    return null;
  }
}

export function roleOf(project, userId) {
  if (!project || typeof project !== "object") return null;
  const id = idString(userId);
  if (id === null || id === "") return null;
  if (idString(project.owner) === id) return "owner";
  if (!Array.isArray(project.members)) return null;

  for (const member of project.members) {
    if (idString(member?.user) === id) {
      return MEMBER_ROLES.includes(member.role) ? member.role : null;
    }
  }
  return null;
}

const PERMISSIONS = Object.freeze({
  owner: Object.freeze({ view: true, chat: true, edit: true, reclaim: true, manage: true, leave: false }),
  editor: Object.freeze({ view: true, chat: true, edit: true, reclaim: false, manage: false, leave: true }),
  viewer: Object.freeze({ view: true, chat: true, edit: false, reclaim: false, manage: false, leave: true }),
});

export function can(role, action) {
  return Object.hasOwn(PERMISSIONS, role)
    && Object.hasOwn(PERMISSIONS[role], action)
    && PERMISSIONS[role][action];
}

export async function findProjectForMember(projectId, userId) {
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(userId)) return null;

  // A read-then-check would load other people's projects into memory first.
  // One membership-scoped query cannot leak whether a project exists.
  return Project.findOne({
    _id: projectId,
    $or: [{ owner: userId }, { "members.user": userId }],
  }).lean();
}

// A Mongoose ValidationError reaches the central handler as a 500. Name and
// description are checked here so the routes can answer 400 with a message
// instead of depending on the schema.
export function parseProjectInput(body, options) {
  const partial = Boolean(options && typeof options === "object" && options.partial === true);
  const source = body !== null && typeof body === "object" && !Array.isArray(body) ? body : {};
  const value = {};

  if (!Object.hasOwn(source, "name") || source.name === undefined) {
    if (!partial) value.name = "Untitled project";
  } else if (typeof source.name !== "string") {
    return { ok: false, message: "Name must be text" };
  } else {
    const name = source.name.trim();
    if (name.length === 0) {
      if (partial) return { ok: false, message: "Name can't be empty" };
      value.name = "Untitled project";
    } else if (name.length > PROJECT_NAME_MAX) {
      return { ok: false, message: `Name must be ${PROJECT_NAME_MAX} characters or fewer` };
    } else {
      value.name = name;
    }
  }

  if (!Object.hasOwn(source, "description") || source.description === undefined) {
    if (!partial) value.description = "";
  } else if (typeof source.description !== "string") {
    return { ok: false, message: "Description must be text" };
  } else {
    const description = source.description.trim();
    if (description.length > PROJECT_DESCRIPTION_MAX) {
      return {
        ok: false,
        message: `Description must be ${PROJECT_DESCRIPTION_MAX} characters or fewer`,
      };
    }
    value.description = description;
  }

  if (partial && !Object.hasOwn(value, "name") && !Object.hasOwn(value, "description")) {
    return { ok: false, message: "Nothing to update" };
  }

  return { ok: true, value };
}
