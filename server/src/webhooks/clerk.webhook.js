import express from "express";
import User from "../models/user.model.js";
import Post from "../models/post.model.js";
import Comment from "../models/comment.model.js";
import { verifyWebhook } from "@clerk/backend/webhooks";

// Clerk -> Mongo user sync. Clerk POSTs here on user.created/updated/deleted so
// posts/comments/messages can reference a local User doc. The raw body is required
// for signature verification, so index.js mounts this behind express.raw() BEFORE
// express.json(). Ported from chat/backend, extended to fill the unified schema
// (username + role) that the blog needs.
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      return res.status(503).json({ message: "Webhook secret is not provided" });
    }

    // Clerk's verifier expects a Web Request with the raw body; express.raw gives a Buffer.
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    const request = new Request("http://internal/webhooks/clerk", {
      method: "POST",
      headers: new Headers(req.headers),
      body: payload,
    });

    // throws if the signature is wrong or the body was tampered with; only then do we trust evt.
    const evt = await verifyWebhook(request, { signingSecret });

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;

      const email =
        u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address ??
        u.email_addresses?.[0]?.email_address;

      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || email?.split("@")[0];

      const username = u.username || email?.split("@")[0] || "";

      // The API gates admin actions on the Clerk session claim, but mirror the
      // role onto the doc too for convenience/read-side checks.
      const role = u.public_metadata?.role === "admin" ? "admin" : "user";

      await User.findOneAndUpdate(
        { clerkId: u.id },
        { clerkId: u.id, email, fullName, username, img: u.image_url, role },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    }

    if (evt.type === "user.deleted") {
      if (evt.data.id) {
        const deletedUser = await User.findOneAndDelete({ clerkId: evt.data.id });
        // A deleted Clerk account shouldn't leave orphaned content behind — mirror
        // the cascade blog-main's webhook did, now that Post/Comment both exist.
        if (deletedUser) {
          await Post.deleteMany({ user: deletedUser._id });
          await Comment.deleteMany({ user: deletedUser._id });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error in Clerk webhook:", error);
    res.status(400).json({ message: "Webhook verification failed" });
  }
});

export default router;
