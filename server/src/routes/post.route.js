import express from "express";
import {
  getPosts,
  getPost,
  createPost,
  deletePost,
  featurePost,
} from "../controllers/post.controller.js";
import increaseVisit from "../middleware/increaseVisit.js";
import { protectRoute, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// Order matters: specific/static paths and non-GET verbs are declared before the
// GET "/:slug" wildcard so it never swallows them. (Slice 5's GET /upload-auth
// must also be registered above /:slug.)
router.get("/", getPosts);
router.post("/", protectRoute, requireAdmin, createPost);
router.patch("/feature", protectRoute, requireAdmin, featurePost);
router.delete("/:id", protectRoute, deletePost);
router.get("/:slug", increaseVisit, getPost);

export default router;
