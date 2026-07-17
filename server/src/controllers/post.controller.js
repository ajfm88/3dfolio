import Post from "../models/post.model.js";
import User from "../models/user.model.js";
import Comment from "../models/comment.model.js";
import { resolveRole } from "../lib/roles.js";
import { getImageKitClient } from "../lib/imagekit.js";

// Controllers are written without try/catch on purpose: Express 5 forwards a
// rejected async handler straight to the central error handler in index.js, so
// the happy path stays readable and errors get one consistent JSON shape.

// GET /api/posts — public list with category/author/search filters, sort, and
// page-based pagination. Returns { posts, hasMore } so the frontend can drive a
// "load more" without a second count request.
export async function getPosts(req, res) {
  const page = parseInt(req.query.page) || 1;
  // Default to 10 (the reference's 2 was a tutorial demo value) and cap the
  // client-supplied limit so a request can't ask for an unbounded page.
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const query = {};
  const { cat, author, search, sort, featured } = req.query;

  if (cat) query.category = cat;
  if (search) query.title = { $regex: search, $options: "i" };
  if (featured) query.isFeatured = true;

  if (author) {
    const user = await User.findOne({ username: author }).select("_id");
    if (!user) return res.status(404).json({ message: "No posts found" });
    query.user = user._id;
  }

  let sortObj = { createdAt: -1 };
  switch (sort) {
    case "oldest":
      sortObj = { createdAt: 1 };
      break;
    case "popular":
      sortObj = { visit: -1 };
      break;
    case "trending":
      sortObj = { visit: -1 };
      // trending = most-visited among the last 7 days only.
      query.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      break;
    case "newest":
    default:
      sortObj = { createdAt: -1 };
  }

  const posts = await Post.find(query)
    .populate("user", "username img")
    .sort(sortObj)
    .limit(limit)
    .skip((page - 1) * limit);

  // Count against the SAME query (the reference counted all posts, so hasMore
  // was wrong under any filter) so pagination is correct for filtered lists.
  const totalPosts = await Post.countDocuments(query);
  const hasMore = page * limit < totalPosts;

  res.status(200).json({ posts, hasMore });
}

// GET /api/posts/:slug — public single post (visit already bumped by the
// increaseVisit middleware that runs ahead of this handler).
export async function getPost(req, res) {
  const post = await Post.findOne({ slug: req.params.slug }).populate(
    "user",
    "username img",
  );
  if (!post) return res.status(404).json({ message: "Post not found" });
  res.status(200).json(post);
}

// POST /api/posts — admin only (protectRoute + requireAdmin gate the route, so
// req.user is the owner account here). Fields are whitelisted rather than
// spread from req.body, so a request can't mass-assign user/isFeatured/visit.
export async function createPost(req, res) {
  const { title, desc, category, content, img } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: "Title and content are required" });
  }

  // Slugify off a stable base and suffix -2, -3, … on collision (deriving each
  // candidate from baseSlug, not the last candidate, so we get foo-3 not
  // foo-2-3). The unique index on slug is the real guard against a race.
  const baseSlug = title.trim().replace(/\s+/g, "-").toLowerCase();
  let slug = baseSlug;
  let counter = 2;
  while (await Post.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const post = await Post.create({
    user: req.user._id,
    title,
    slug,
    desc,
    category,
    content,
    img,
  });

  res.status(201).json(post);
}

// GET /api/posts/upload-auth — admin only (protectRoute + requireAdmin, same as
// createPost). Returns short-lived signed params (token/expire/signature) that
// let the browser upload a cover image straight to ImageKit — the private key
// never leaves this server, and the image itself never passes through it either.
export function getUploadAuth(req, res) {
  const imagekit = getImageKitClient();

  if (!imagekit) {
    return res.status(503).json({ message: "Image upload is not configured yet" });
  }

  res.status(200).json(imagekit.helper.getAuthenticationParameters());
}

// DELETE /api/posts/:id — admin deletes any post; a regular author could delete
// only their own (owner scope enforced by matching user on the query). Gated by
// protectRoute; the owner-vs-admin split lives here rather than in middleware.
// Either branch also deletes the post's comments — a comment without its post
// is dead weight the frontend would just filter around forever.
export async function deletePost(req, res) {
  if (resolveRole(req) === "admin") {
    const deleted = await Post.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Post not found" });
    await Comment.deleteMany({ post: req.params.id });
    return res.status(200).json({ message: "Post has been deleted" });
  }

  const deletedPost = await Post.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!deletedPost) {
    return res.status(403).json({ message: "You can delete only your own posts" });
  }

  await Comment.deleteMany({ post: req.params.id });
  res.status(200).json({ message: "Post has been deleted" });
}

// PATCH /api/posts/feature — admin only. Toggles the isFeatured flag used by the
// homepage's featured row. requireAdmin already gated the route.
export async function featurePost(req, res) {
  const { postId } = req.body;

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ message: "Post not found" });

  post.isFeatured = !post.isFeatured;
  await post.save();

  res.status(200).json(post);
}
