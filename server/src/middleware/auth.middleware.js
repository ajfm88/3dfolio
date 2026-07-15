import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";

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
