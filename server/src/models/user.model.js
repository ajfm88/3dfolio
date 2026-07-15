import mongoose from "mongoose";

// Unified User model — merges the two reference schemas:
//   - blog-main/backend keyed users on `clerkUserId` with `username` + `img` (+ savedPosts)
//   - chat/backend       keyed users on `clerkId`     with `fullName` + `profilePic`
// We standardize on `clerkId`, keep a canonical `img` avatar (chat's profilePic
// maps here during the chat port), and add `role` for admin gating. Rows are
// created/updated by the Clerk webhook, never by user input.
const userSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      default: "",
    },
    // Blog author handle (used for author links/filters). Not unique: chat-only
    // users may share a derived handle, and the blog is effectively single-author.
    username: {
      type: String,
      default: "",
    },
    // Canonical avatar URL. Blog author image and chat profile pic both live here.
    img: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // Blog-only; the Saved Posts UI is cut for v1 but the field is harmless.
    savedPosts: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
