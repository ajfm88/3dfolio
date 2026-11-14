import Project from "../models/project.model.js";
import Canvas from "../models/canvas.model.js";
import ProjectMessage from "../models/projectMessage.model.js";
import { normalizeEmail } from "./projectMembership.js";
import { onMemberChanged, onProjectDeleted } from "../sockets/workspace.socket.js";

export async function deleteProjectContent(io, projectId, registry) {
  onProjectDeleted(io, projectId, registry);
  await Canvas.deleteOne({ project: projectId });
  await ProjectMessage.deleteMany({ project: projectId });
}

export async function deleteUserCollaborateData(io, user, registry) {
  const id = user._id;
  const owned = await Project.find({ owner: id }).select("_id").lean();
  for (const project of owned) {
    await Project.deleteOne({ _id: project._id, owner: id });
    await deleteProjectContent(io, project._id, registry);
  }
  const memberships = await Project.find({ "members.user": id }).select("_id").lean();
  await Project.updateMany({ "members.user": id }, { $pull: { members: { user: id } } });
  for (const project of memberships) onMemberChanged(io, project._id, id, null, registry);
  const email = normalizeEmail(user.email);
  if (email) await Project.updateMany({ "invites.email": email }, { $pull: { invites: { email } } });
  await ProjectMessage.deleteMany({ sender: id });
}
