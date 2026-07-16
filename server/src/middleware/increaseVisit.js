import Post from "../models/post.model.js";

// Bump a post's visit counter on each read, then hand off to getPost. Runs as a
// separate middleware (rather than inside getPost) so the read path stays a
// clean lookup and the counter is a single atomic $inc — no read-modify-write
// race. The Popular/Trending sorts in getPosts order on this field.
export default async function increaseVisit(req, res, next) {
  await Post.findOneAndUpdate({ slug: req.params.slug }, { $inc: { visit: 1 } });
  next();
}
