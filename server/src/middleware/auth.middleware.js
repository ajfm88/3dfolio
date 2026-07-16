import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";
import { resolveRole } from "../lib/roles.js";

// Gate for signed-in-only routes. clerkMiddleware() (mounted in index.js) reads
// the session from the Authorization: Bearer token (cross-origin SPA) or cookie;
// getAuth() then yields the Clerk userId. We resolve that to the synced Mongo
// user and hang it on req.user for downstream handlers.
export async function protectRoute(req, res, next) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      // The webhook hasn't synced this Clerk user into Mongo yet.
      return res.status(404).json({ message: "User profile is not synced yet" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in protectRoute middleware:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin-only gate. Mount AFTER protectRoute so req.user is available for the
// role fallback (see resolveRole). Used on the write side of the blog — create,
// feature — which only the owner account (ale@ajfm88.com) may hit. The API
// enforces this itself so a hand-crafted request can't bypass the hidden UI.
export function requireAdmin(req, res, next) {
  if (resolveRole(req) !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}
