import mongoose from "mongoose";

// A comment always references a User (the commenter) and a Post (what it's on).
// Both are hard refs into their respective collections, cascade-deleted when
// either side goes away (see post.controller.js deletePost and the Clerk
// webhook's user.deleted handler).
const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    desc: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Comment", commentSchema);
