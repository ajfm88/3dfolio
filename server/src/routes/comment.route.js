import express from "express";
import { getPostComments, addComment, deleteComment } from "../controllers/comment.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/:postId", getPostComments);
router.post("/:postId", protectRoute, addComment);
router.delete("/:id", protectRoute, deleteComment);

export default router;
