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
import { protectRoute } from "../middleware/auth.middleware.js";
import { authorizeProjectChat, projectMediaUpload } from "../middleware/projectMessage.middleware.js";

const router = express.Router();

router.use(protectRoute);

// Static paths S26 adds (/invites/mine, /invites/:inviteId/...) must be
// declared before /:id, the same ordering rule as post.route.js.
router.get("/", listProjects);
router.post("/", createProject);
router.get("/:id", getProject);
router.patch("/:id", updateProject);
router.delete("/:id", deleteProject);
router.get("/:id/messages", authorizeProjectChat, listProjectMessages);
router.post("/:id/messages", authorizeProjectChat, projectMediaUpload, sendProjectMessage);

export default router;
