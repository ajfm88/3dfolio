import mongoose from "mongoose";

// Blog post. `user` is a hard reference into the shared `users` collection (the
// Clerk-synced author), so a post always resolves to a real profile. `content`
// holds the rich-text HTML produced by the editor; `img` is the ImageKit CDN URL
// of the cover image (wired in slice 5). `slug` is the unique, URL-safe key the
// public routes look posts up by. `visit` powers the Popular/Trending sorts —
// bumped by the increaseVisit middleware on every read.
const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    desc: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "general",
    },
    // Rich-text HTML from the editor (rendered via dangerouslySetInnerHTML on
    // the frontend, so the author is trusted — this is a single-author blog).
    content: {
      type: String,
      required: true,
    },
    // ImageKit CDN URL of the cover image. Optional; upload flow lands in slice 5.
    img: {
      type: String,
      default: "",
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    visit: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Post", postSchema);
