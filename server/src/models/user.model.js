import mongoose from "mongoose";

// One User model serving both features, which want different things from the
// same person: the blog needs an author handle and a byline image, chat needs a
// display name and a sidebar avatar, both need a stable key back to Clerk, and
// only the blog needs a role. Rather than let each feature add its own field for
// the same idea (an `img` here, a `profilePic` there), there's one canonical
// name per concept: `clerkId` to join, `img` for any avatar, `role` for admin
// gating. Rows are created/updated by the Clerk webhook, never by user input.
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
