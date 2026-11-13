import express from "express";
import {
  listProjectMessages,
  sendProjectMessage,
} from "../controllers/projectMessage.controller.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../controllers/project.controller.js";
import {
  acceptInvite,
  createInvite,
  declineInvite,
  listMyInvites,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "../controllers/projectMember.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { authorizeProjectChat, projectMediaUpload } from "../middleware/projectMessage.middleware.js";

const router = express.Router();

router.use(protectRoute);

// Static invitation paths come before the generic /:id routes, the same
// ordering rule as post.route.js.
router.get("/invites/mine", listMyInvites);
router.post("/invites/:inviteId/accept", acceptInvite);
router.post("/invites/:inviteId/decline", declineInvite);
router.get("/", listProjects);
router.post("/", createProject);
router.get("/:id", getProject);
router.patch("/:id", updateProject);
router.delete("/:id", deleteProject);
router.post("/:id/invites", createInvite);
router.delete("/:id/invites/:inviteId", revokeInvite);
router.patch("/:id/members/:userId", updateMemberRole);
router.delete("/:id/members/:userId", removeMember);
router.get("/:id/messages", authorizeProjectChat, listProjectMessages);
router.post("/:id/messages", authorizeProjectChat, projectMediaUpload, sendProjectMessage);

export default router;
