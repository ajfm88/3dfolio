import express from "express";
import {
  getPosts,
  getPost,
  createPost,
  deletePost,
  featurePost,
  getUploadAuth,
} from "../controllers/post.controller.js";
import increaseVisit from "../middleware/increaseVisit.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// Order matters: specific/static paths and non-GET verbs are declared before the
// GET "/:slug" wildcard so it never swallows them — upload-auth included.
router.get("/", getPosts);
router.post("/", protectRoute, requireAdmin, createPost);
router.patch("/feature", protectRoute, requireAdmin, featurePost);
router.get("/upload-auth", protectRoute, requireAdmin, getUploadAuth);
router.delete("/:id", protectRoute, deletePost);
router.get("/:slug", increaseVisit, getPost);

export default router;
