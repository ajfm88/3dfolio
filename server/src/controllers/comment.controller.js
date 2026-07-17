import Comment from "../models/comment.model.js";
import { resolveRole } from "../lib/roles.js";

// No try/catch here either — same reasoning as post.controller.js: Express 5
// forwards a rejected async handler straight to the central error handler.

// GET /api/comments/:postId — public, newest first.
export async function getPostComments(req, res) {
  const comments = await Comment.find({ post: req.params.postId })
    .populate("user", "username img")
    .sort({ createdAt: -1 });

  res.status(200).json(comments);
}

// POST /api/comments/:postId — any signed-in user (protectRoute gates the
// route, so req.user is already the synced Mongo author). Whitelists `desc`
// rather than spreading req.body, so a request can't mass-assign `user` or
// `post` onto some other author/thread.
export async function addComment(req, res) {
  const { desc } = req.body;

  if (!desc) {
    return res.status(400).json({ message: "Comment text is required" });
  }

  const comment = await Comment.create({
    desc,
    user: req.user._id,
    post: req.params.postId,
  });

  res.status(201).json(comment);
}

// DELETE /api/comments/:id — admin deletes any comment; a regular commenter is
// scoped to their own (same owner-vs-admin split as deletePost in
// post.controller.js: ownership is enforced by the query, not a separate
// read-then-check).
export async function deleteComment(req, res) {
  if (resolveRole(req) === "admin") {
    const deleted = await Comment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Comment not found" });
    return res.status(200).json({ message: "Comment has been deleted" });
  }

  const deletedComment = await Comment.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!deletedComment) {
    return res.status(403).json({ message: "You can delete only your own comment" });
  }

  res.status(200).json({ message: "Comment has been deleted" });
}
