import express from "express";
import cors from "cors";
import "dotenv/config";

import { clerkMiddleware } from "@clerk/express";

import { connectDB } from "./lib/db.js";
import { app, server } from "./lib/socket.js";

import clerkWebhook from "./webhooks/clerk.webhook.js";
import authRoutes from "./routes/auth.route.js";
import postRoutes from "./routes/post.route.js";
import commentRoutes from "./routes/comment.route.js";

const PORT = process.env.PORT || 3000;

const CLIENT_URLS = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Clerk webhooks verify against the RAW body, so mount the webhook (with
// express.raw) BEFORE express.json() parses everything else.
app.use("/api/webhooks/clerk", express.raw({ type: "application/json" }), clerkWebhook);

app.use(express.json());
app.use(cors({ origin: CLIENT_URLS, credentials: true }));
app.use(clerkMiddleware());

app.get("/", (req, res) => {
  res.send("Hello from JS + Express");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);

// (chat messages -> chat-plan Phase A)

// central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Something went wrong!" });
});

server.listen(PORT, () => {
  connectDB();
  console.log("Server is up and running on PORT:", PORT);
});
