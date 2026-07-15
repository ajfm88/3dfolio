// Returns the synced Mongo user for the current Clerk session. protectRoute has
// already resolved req.user; the frontend uses this to bootstrap its auth store
// (and, for chat, the socket connection keyed on the Mongo _id).
export async function checkAuth(req, res) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  res.status(200).json(req.user);
}
