# Portfolio API — Shared Express Backend

The Node/Express service that powers the dynamic, authenticated parts of my portfolio: the **`/blog`** (posts + comments) and **`/chat`** (real-time messaging) features. Everything else on the site is a static 3D React front end; this server is where identity, persistence, and real-time live.

> **Status: complete and deployed.** The service is live on Render at `https://3dfolio-ajfm88-server.onrender.com`, and both frontends that consume it — the blog (`src/blog/`, lazy `/blog`) and the chat (`src/chat/`, lazy `/chat`) — are finished and running against it, so every endpoint documented below has a real consumer. It was built one small piece per commit on purpose: every step is reviewable on its own, and the server runs at every commit.

## 📋 Table of Contents

1.  💡 [The one-line pitch](#the-one-line-pitch)
2.  🧭 [Why this exists](#why-this-exists-the-architectural-decision-that-matters-most)
3.  ⚙️ [Tech stack and why each piece](#tech-stack-and-why-each-piece)
4.  🔀 [How a request flows through the server](#how-a-request-flows-through-the-server)
5.  🔐 [Authentication](#authentication-clerk-as-the-identity-source-mongo-as-the-local-mirror)
6.  ⚡ [Real-time](#real-time-why-the-server-is-an-httpserver-not-applisten)
7.  🧬 [The unified data model](#the-unified-data-model-one-user-two-feature-sets)
8.  📝 [Blog posts API](#blog-posts-api-apiposts)
9.  💬 [Blog comments API](#blog-comments-api-apicomments)
10. 🖼️ [Blog media uploads](#blog-media-uploads-get-apipostsupload-auth)
11. 📨 [Chat messages API](#chat-messages-api-apimessages)
12. 🛡️ [Security and robustness choices](#security-and-robustness-choices)
13. 🗂️ [Project structure](#project-structure)
14. 📡 [API surface](#api-surface)
15. 📦 [Request and response shapes](#request-and-response-shapes)
16. 🚨 [Error handling](#error-handling)
17. 🤸 [Running it locally](#running-it-locally)
18. 🚀 [Deploying (Render)](#deploying-render)

---

## The one-line pitch

> I built one Express API that serves two different product features (a blog and a chat app) off a **single auth system, single database, and single deployment** — instead of standing up two backends. The interesting engineering is in the decisions that made that consolidation clean: where identity lives, how third-party auth stays in sync with my own data, and how I layered real-time on top of plain HTTP.

---

## Why this exists (the architectural decision that matters most)

The obvious way to build a blog and a chat app is as two separate services, each with its own backend, its own user table, and its own auth. Running both that way would have meant **two servers, two databases, two user records for the same human, and two deploys** to keep alive on a hobby budget.

I made a deliberate call to **merge them into one shared backend**:

- **One Clerk application** is the source of truth for identity across both features.
- **One MongoDB database** holds a single `users` collection that both features reference, alongside blog `posts`/`comments` and chat `messages`.
- **One Express process** (wrapped in an `http.Server` so Socket.io can ride along) serves the REST API for the blog and the WebSocket layer for chat.
- **One deployment** on Render.

The cost of that decision was designing one data model and one auth convention that serve two genuinely different feature sets. Working that through is most of what the "why" below is about.

> **I also moved this off Firebase on purpose.** The rest of my site uses Firebase (Firestore/Storage/Auth) for simple, single-author admin content. But the blog + chat need relational-style references between users, posts, comments, and messages, plus a real WebSocket server for presence and message delivery. A self-hosted Express + MongoDB + Socket.io stack models that far more naturally than Firestore's document model and gives me full control over the request lifecycle — so I chose the right tool for _this_ job rather than forcing everything into one platform.

---

## Tech stack and why each piece

| Concern        | Choice                            | Version | Why                                                                                                                                                                                                               |
| -------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP framework | **Express**                       | 5       | Minimal, well-understood, huge ecosystem. Express 5's native `async` error propagation keeps controllers clean.                                                                                                    |
| Database       | **MongoDB Atlas** + **Mongoose**  | 9       | Document model fits blog posts and chat messages naturally; Mongoose gives me schema validation and a typed-ish model layer over a schemaless store.                                                               |
| Authentication | **Clerk** (`@clerk/express`)      | 2       | Offloads the genuinely hard, high-risk parts of auth — password storage, sessions, OAuth, MFA — to a specialist. I own my app logic, not a credential database.                                                    |
| Real-time      | **Socket.io**                     | 4       | Presence (who's online) and instant message delivery for chat, with automatic reconnection and a room/broadcast model.                                                                                             |
| Media uploads  | **ImageKit** (`@imagekit/nodejs`) | 7       | Off-loads image storage, CDN delivery and on-the-fly transforms. Blog covers upload straight from the browser; chat media goes through the server, since a message needs its media URL before it can be emitted.   |
| File parsing   | **Multer**                        | 2       | In-memory multipart parsing for chat media, with a 25 MB cap and an image/video-only filter, before the buffer is handed to ImageKit.                                                                              |
| CORS           | **cors**                          | 2.8     | The SPA is cross-origin (Vercel → Render), so the allowlist is explicit and driven by `CLIENT_URL` rather than a wildcard.                                                                                         |
| Config         | **dotenv**                        | 17      | Twelve-factor style — every secret and environment difference comes from the environment, nothing is hardcoded.                                                                                                    |
| Dev loop       | **nodemon**                       | 3       | Auto-restart on save.                                                                                                                                                                                             |

---

## How a request flows through the server

The order of middleware in [`src/index.js`](src/index.js) is not accidental — it encodes two real constraints:

```
              ┌─────────────────────────────────────────────────────────┐
  incoming ──▶│ 1. /api/webhooks/clerk  (express.raw — BEFORE json)       │
  request     │ 2. express.json()        parse every other body           │
              │ 3. cors()                allow the SPA's origin(s)         │
              │ 4. clerkMiddleware()     attach session context to req    │
              │ 5. routes  (/health, /api/auth, …)                        │
              │ 6. central error handler                                  │
              └─────────────────────────────────────────────────────────┘
```

**Why the webhook is mounted first, with `express.raw()`:** Clerk signs its webhooks and I verify that signature against the **exact raw bytes** of the request body. If `express.json()` parsed the body first, it would re-serialize it and the signature check would fail on a body that looks identical but isn't byte-for-byte the same. So the webhook route is mounted _before_ the JSON parser and reads a raw `Buffer`. This is the kind of subtle ordering bug that's painful to debug later, so it's the first thing the file does — with a comment explaining why.

---

## Authentication: Clerk as the identity source, Mongo as the local mirror

This is the pattern I'd most want to talk through in an interview, because it's a real distributed-systems problem in miniature: **two systems that both need to know about a user, kept in sync.**

- **Clerk owns identity.** Sign-up, login, OAuth, sessions, and tokens all live in Clerk. My server never sees a password.
- **My database owns app data.** A blog post needs an author; a comment needs a commenter; a chat message needs a sender and receiver. Those are foreign keys into _my_ `users` collection, not Clerk.

So every Clerk user needs a corresponding local `User` document. I keep them in sync **two ways**, which cover the two failure modes:

1. **Webhook (push, eventually-consistent):** Clerk POSTs to [`/api/webhooks/clerk`](src/webhooks/clerk.webhook.js) on `user.created` / `user.updated` / `user.deleted`. I verify the signature, then `upsert` the user into Mongo (or delete them). This keeps the mirror current without the client doing anything.
2. **Route guard (pull, strongly-consistent at request time):** [`protectRoute`](src/middleware/auth.middleware.js) reads the Clerk session from the `Authorization: Bearer` token (my SPA is cross-origin, so it sends a token, not just a cookie), resolves the Clerk `userId`, looks up the matching Mongo user, and hangs it on `req.user` for downstream handlers. If the webhook hasn't synced that user yet, it returns a clear `404 "not synced yet"` instead of a confusing crash.

`GET /api/auth/check` is the thin endpoint the front end calls on load to bootstrap its auth store (and, for chat, to get the Mongo `_id` its socket connection is keyed on).

**Authorization / admin gating** is defense-in-depth: the source of truth is the Clerk session claim (`public_metadata.role`), and I _also_ mirror the role onto the Mongo doc for convenient read-side checks. Roles come from Clerk and the webhook, **never from user input** — a client can't POST itself to admin.

---

## Real-time: why the server is an `http.Server`, not `app.listen()`

Socket.io needs to attach to the underlying HTTP server to handle the WebSocket upgrade handshake. So in [`src/lib/socket.js`](src/lib/socket.js) I create the server explicitly:

```js
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_URLS } });
```

`index.js` then calls `server.listen(...)` (the HTTP server), **not** `app.listen(...)` (Express's convenience wrapper) — so Express handles REST and Socket.io handles WebSockets over the same port and process.

Presence is tracked in an in-memory `userId → socketId` map. On connect I record the socket and broadcast the full online set; on disconnect I remove it and broadcast again. A `getReceiverSocketId()` helper looks up one recipient's socket by their Mongo `_id`, and `sendMessage` uses it to `io.to(receiverSocketId).emit("newMessage", newMessage)` — a message is delivered straight to the one open socket that needs it, not broadcast to everyone. If the recipient isn't currently connected, the emit is simply skipped; they'll see the message via the normal `GET /api/messages/:id` fetch next time they open the thread. (In-memory presence is the right trade-off for a single-instance hobby deploy; scaling to multiple instances would swap this for a Redis adapter — a change I've scoped but not needed yet.)

---

## The unified data model (one user, two feature sets)

Blog and chat want different things from the same person. The blog needs an author handle to build `?author=` links and a byline image. Chat needs a display name and an avatar for the sidebar. Both need a stable key back to Clerk, and only the blog needs an admin role. Modelling that as two collections would mean two records for the same human, kept in sync forever — the exact problem the shared backend exists to avoid.

So there is one `users` collection, with one canonical field per concept:

| Concept      | Field      | Serves | Notes                                          |
| ------------ | ---------- | ------ | ---------------------------------------------- |
| Clerk key    | `clerkId`  | both   | Unique; the only join back to Clerk            |
| Display name | `fullName` | chat   | Sidebar rows and message headers               |
| Handle       | `username` | blog   | Author links and `?author=` filters            |
| Avatar       | `img`      | both   | One field, not a per-feature second one        |
| Role         | `role`     | blog   | Admin gating; mirrored from Clerk metadata     |

The temptation is to let each feature invent its own field for the same idea — an `img` for the blog byline and a `profilePic` for the chat sidebar — because each reads naturally in isolation. Committing to one name per concept ([`src/models/user.model.js`](src/models/user.model.js)) is a small decision, but it's the difference between a clean model and one that leaks two histories forever.

### The four collections

```js
// users — written by the Clerk webhook, never by user input
{
  _id:        ObjectId,
  clerkId:    String,    // unique; the Clerk user id both features key off
  email:      String,    // unique
  fullName:   String,
  username:   String,    // blog author handle; not unique (the blog is single-author)
  img:        String,    // canonical avatar: blog author image and chat profile pic
  role:       String,    // "user" | "admin" — mirrors the Clerk public-metadata role
  savedPosts: [String],  // blog-only; the Saved Posts UI is cut for v1
  createdAt:  Date,
  updatedAt:  Date
}
```

```js
// posts
{
  _id:        ObjectId,
  user:       ObjectId,  // ref User — the author
  title:      String,
  slug:       String,    // unique, URL-safe; the key every public read looks up by
  desc:       String,
  category:   String,    // defaults to "general"
  content:    String,    // rich-text HTML from the editor
  img:        String,    // ImageKit CDN URL of the cover image
  isFeatured: Boolean,
  visit:      Number,    // bumped by increaseVisit; powers Popular and Trending
  createdAt:  Date,
  updatedAt:  Date
}
```

```js
// comments
{
  _id:       ObjectId,
  user:      ObjectId,   // ref User — the commenter
  post:      ObjectId,   // ref Post — cascade-deleted with either side
  desc:      String,
  createdAt: Date,
  updatedAt: Date
}
```

```js
// messages
{
  _id:        ObjectId,
  senderId:   ObjectId,  // ref User
  receiverId: ObjectId,  // ref User
  text:       String,    // optional — a message can be media-only
  image:      String,    // optional — ImageKit URL
  video:      String,    // optional — ImageKit URL
  createdAt:  Date,
  updatedAt:  Date
}
```

There is deliberately **no `conversations` collection** — threads are aggregated out of `messages` on read (see [Chat messages API](#chat-messages-api-apimessages)), so there's no second collection to keep in sync with the first.

---

## Blog posts API (`/api/posts`)

This is the first real feature endpoint on top of the foundation, and it shows the whole stack working together: public reads, admin-gated writes, and a small piece of read-side analytics.

**The routes** ([`src/routes/post.route.js`](src/routes/post.route.js)):

| Method   | Path                | Auth              | What it does                                                       |
| -------- | ------------------- | ----------------- | ----------------------------------------------------------------- |
| `GET`    | `/api/posts`        | public            | List with filters (`cat`, `author`, `search`), `sort`, pagination |
| `GET`    | `/api/posts/:slug`  | public            | One post by slug; bumps its visit counter first                   |
| `POST`   | `/api/posts`        | **admin**         | Create a post (auto-slugged)                                      |
| `PATCH`  | `/api/posts/feature`| **admin**         | Toggle a post's "featured" flag                                   |
| `DELETE` | `/api/posts/:id`    | admin **or** owner| Delete a post                                                     |

A few decisions here are worth walking through:

- **Public read, gated write — enforced at the API, not the UI.** Anyone can read posts; only the owner account can create or feature one. The blog's "Write" button is hidden from non-admins on the front end, but hiding UI isn't security — so `protectRoute` + `requireAdmin` guard the write routes server-side. I verified this at runtime: anonymous `POST`/`PATCH`/`DELETE` all return `401` before touching the database.

- **Two-tier authorization.** `protectRoute` answers "are you signed in?" (resolves the Clerk session to a Mongo user on `req.user`); `requireAdmin` answers "are you allowed?" ([`src/lib/roles.js`](src/lib/roles.js) reads the role from the Clerk session claim, falling back to the webhook-mirrored role on the user doc). `deletePost` is the interesting middle case — it's not purely admin: an admin can delete any post, but a regular author is scoped to their own, which the query expresses directly (`findOneAndDelete({ _id, user: req.user._id })`) so ownership is enforced in the database round-trip, not a separate read-then-check.

- **Mass-assignment protection.** `createPost` whitelists `title`/`desc`/`category`/`content`/`img` and sets `user` from the authenticated session — it never spreads `req.body` into the model, so a crafted request can't set `isFeatured`, inflate `visit`, or forge authorship.

- **Slug generation.** Titles become URL-safe slugs; on collision I suffix `-2`, `-3`, … derived from the *base* slug (not the previous candidate, which would compound into `foo-2-3`). The `unique` index on `slug` is the real guard against a race between the check and the insert.

- **Visit counter as its own middleware.** `GET /:slug` runs [`increaseVisit`](src/middleware/increaseVisit.js) before the read — a single atomic `$inc` (no read-modify-write race) that keeps the read handler a clean lookup. That counter is what powers the **Popular** (all-time visits) and **Trending** (visits within the last 7 days) sorts. These were cut when the blog was briefly planned on Firebase (they'd have needed public writes); on Mongo they're free, so they're back.

- **Correct pagination under filters.** The list counts documents against the *same* query it fetched — counting all posts instead is the easy mistake, and it makes `hasMore` wrong the moment a category or search narrows the set — and it caps the client-supplied `limit` so no request can ask for an unbounded page.

- **No try/catch in the controllers.** Express 5 forwards a rejected async handler straight to the central error handler, so every controller stays a clean happy-path and errors get one consistent `{ message }` shape.

> Cover-image uploads (the `img` field) go through ImageKit — see [Blog media uploads](#blog-media-uploads-get-apipostsupload-auth) below. A post's `img` is just the path that upload returns, passed in as one more field in the `createPost` whitelist.

---

## Blog comments API (`/api/comments`)

Comments reuse every pattern the posts API established — same `protectRoute`/`resolveRole` gating, same query-scoped ownership, same whitelist-not-spread hardening — which is really the point: once the auth and authorization primitives exist, a second feature endpoint is small.

**The routes** ([`src/routes/comment.route.js`](src/routes/comment.route.js)):

| Method   | Path                    | Auth              | What it does                          |
| -------- | ------------------------ | ----------------- | -------------------------------------- |
| `GET`    | `/api/comments/:postId`  | public            | List a post's comments, newest first   |
| `POST`   | `/api/comments/:postId`  | **signed-in**      | Add a comment (any authenticated user) |
| `DELETE` | `/api/comments/:id`      | admin **or** owner| Delete a comment                       |

Two things carry over directly from the posts API, and one thing is new:

- **Signed-in-to-write, not admin-to-write.** Unlike posts (admin-only create), *any* signed-in user can comment — `POST` sits behind `protectRoute` alone, no `requireAdmin`. Reading is still public. This is the same two-tier model (`protectRoute` = "who are you", a second gate = "are you allowed") applied with a different second gate for a different resource.

- **Whitelist, not spread.** `addComment` pulls only `desc` out of `req.body` and sets `user`/`post` itself from `req.user._id` and `req.params.postId`. Spreading `req.body` into the new comment would let a crafted request set `user` or `post` directly, forging authorship or attaching a comment to the wrong thread — the same class of bug `createPost`'s whitelist already closes on the posts side.

- **Cascade deletes.** A comment references a post and a user; deleting either side without cleaning up its comments leaves orphaned rows the frontend would have to silently filter around forever. Two places now clean up after themselves:
  - [`deletePost`](src/controllers/post.controller.js) runs `Comment.deleteMany({ post: id })` after removing the post (both the admin and owner-scoped branches).
  - The Clerk webhook's `user.deleted` handler ([`src/webhooks/clerk.webhook.js`](src/webhooks/clerk.webhook.js)) runs `Post.deleteMany` and `Comment.deleteMany` against the deleted user's Mongo `_id`. Both cascades run *after* the parent record is confirmed deleted, and both are scoped by ID (`{ post: id }` / `{ user: id }`), so they can't touch unrelated documents.

---

## Blog media uploads (`GET /api/posts/upload-auth`)

Cover images upload **client-side, straight from the browser to ImageKit** — the file itself never passes through this server. What the server provides is a short-lived, signed authorization the browser presents to ImageKit's upload API.

- **The endpoint only signs; it never touches a file.** [`getUploadAuth`](src/controllers/post.controller.js) calls the ImageKit SDK's `helper.getAuthenticationParameters()`, which HMAC-signs a token + expiry (default 30 minutes) using the private key. It returns `{ token, expire, signature }` — enough for the browser to authenticate a direct upload, nothing more.
- **Admin-gated**, same as `createPost`/`featurePost` (`protectRoute` + `requireAdmin`): only the owner account can mint an upload authorization, since only the owner can create posts in the first place.
- **The private key never leaves the server** — it signs the params here and is never sent to the client; only the resulting `token`/`expire`/`signature` are.
- **The ImageKit client is built lazily, not at import time** ([`src/lib/imagekit.js`](src/lib/imagekit.js)). The `@imagekit/nodejs` SDK's constructor throws *synchronously* if `IK_PRIVATE_KEY` is missing — and this module is imported by `post.route.js` on every server boot, so building the client eagerly at the top of the file would have crashed `npm run dev` the instant ImageKit wasn't configured yet — which is every environment where the endpoint is built before its third-party keys land. Instead `getImageKitClient()` checks the env var first and only constructs (and caches) the client once it's present; `getUploadAuth` returns a clean `503 "Image upload is not configured yet"` if it's still missing, the same pattern the Clerk webhook already uses for its own missing signing secret.
- **`img` on `Post` stays a plain string** ([`src/models/post.model.js`](src/models/post.model.js)) — the create flow doesn't change; the frontend sends the path the direct upload hands back as one more field in the existing `createPost` whitelist.

---

## Chat messages API (`/api/messages`)

Chat reuses the identity layer wholesale (same `protectRoute`, same unified `User`) but everything about *what* it stores and *how it's delivered* is new — a message needs two participants instead of one author, has to arrive in real time instead of waiting for the next page load, and its media has to reach ImageKit through the server rather than straight from the browser.

**The routes** ([`src/routes/message.route.js`](src/routes/message.route.js)) — all behind `protectRoute`, no public reads (unlike the blog, chat is not content meant to be browsed signed-out):

| Method | Path                     | What it does                                                        |
| ------ | ------------------------ | -------------------------------------------------------------------- |
| `GET`  | `/api/messages/users`    | Every other synced user, for the "start a new conversation" list     |
| `GET`  | `/api/messages/conversations` | Just the people you've already exchanged messages with, most-recent first |
| `GET`  | `/api/messages/:id`      | Full message history with one other user, oldest first               |
| `POST` | `/api/messages/send/:id` | Send text and/or one image/video to that user                        |

A few decisions worth walking through:

- **Conversations are derived, not stored.** There's no `Conversation` model — [`getConversationsForSidebar`](src/controllers/message.controller.js) runs a Mongo aggregation over `Message` itself: match every message where I'm the sender or receiver, group by "the other participant" (a `$cond` picking whichever side isn't me), keep the most recent timestamp per group, sort, then `$lookup` each group's `_id` back into a full `User` document. One collection stays the single source of truth instead of a second one I'd have to keep in sync with it.

- **Server-side upload, unlike the blog.** Cover images go straight from the browser to ImageKit (see [Blog media uploads](#blog-media-uploads-get-apipostsupload-auth) above); chat media goes through this server instead ([`upload.middleware.js`](src/middleware/upload.middleware.js) — Multer, in-memory storage, a 25 MB cap, and a `fileFilter` that rejects anything that isn't `image/*` or `video/*`). The reason for the different pattern: `sendMessage` has to know the resulting media URL *before* it can save the message and emit it over the socket, so the upload has to complete inside the same request that creates the message — there's no separate "upload, then reference the URL" step like the blog's editor has. `uploadChatMedia` ([`src/lib/imagekit.js`](src/lib/imagekit.js)) reuses the same lazily-built ImageKit client the blog's upload-auth endpoint uses, just calling `files.upload()` directly with the buffer instead of only signing params, into a separate `/chat` folder on the same ImageKit account.

- **Real-time delivery, not polling.** After saving, `sendMessage` looks up the receiver's live socket via `getReceiverSocketId()` and emits `newMessage` directly to it (see [Real-time](#real-time-why-the-server-is-an-httpserver-not-applisten) above) — if they have the app open, the message appears instantly; if not, it's just there next time they fetch the thread.

- **Whitelist by construction, not by filtering.** `sendMessage` builds the new `Message` from exactly four fields it derives itself (`senderId` from the session, `receiverId` from the URL param, `text` from the body, `image`/`video` from the upload result) — there's no `req.body` spread to whitelist *against* in the first place, so there's no mass-assignment surface to close.

- **Media is genuinely optional, on both ends.** A message can be text-only, media-only, or both — `text` is never required, and the frontend composer only appends it to the upload's `FormData` when there's actually a caption to send.

---

## Security and robustness choices

- **Webhook signature verification** — the webhook trusts the payload _only_ after `verifyWebhook` passes; a bad or tampered signature returns `400` and touches nothing.
- **Strict CORS allowlist** — origins come from `CLIENT_URL` (comma-separated: local SPA in dev, my Vercel domain in prod) with `credentials: true`. No `*`.
- **Fail-fast on misconfig** — the DB connection [exits the process](src/lib/db.js) if `MONGO_URI` is missing or the connect fails, so a broken deploy dies loudly instead of serving half-broken.
- **Central error handler** — one place formats errors into consistent JSON (`{ message }`) and honors a handler-set status code, so controllers can just `throw`.
- **Nothing hardcoded** — every secret and every environment difference is an env var, documented in [`.env.example`](.env.example).
- **Health check** — `GET /health` for uptime monitoring and deploy readiness.

---

## Project structure

```
server/
├── src/
│   ├── index.js                  # entry point: middleware order, routes, error handler, listen
│   ├── lib/
│   │   ├── db.js                 # MongoDB (Mongoose) connection, fail-fast
│   │   ├── roles.js              # resolveRole: Clerk claim -> webhook-mirrored fallback
│   │   ├── imagekit.js           # getImageKitClient: lazy-built signing client
│   │   └── socket.js             # http.Server + Socket.io, presence map, app/server export
│   ├── middleware/
│   │   ├── auth.middleware.js    # protectRoute (signed-in) + requireAdmin (role gate)
│   │   ├── increaseVisit.js      # atomic $inc of a post's visit counter
│   │   └── upload.middleware.js  # Multer: in-memory, 25MB cap, image/video-only filter (chat)
│   ├── controllers/
│   │   ├── auth.controller.js    # checkAuth: return the synced user
│   │   ├── post.controller.js    # posts: list / read / create / delete / feature
│   │   ├── comment.controller.js # comments: list / add / delete
│   │   └── message.controller.js # messages: users / conversations / history / send + socket emit
│   ├── models/
│   │   ├── user.model.js         # unified User schema
│   │   ├── post.model.js         # Post schema (author ref, slug, content, visit)
│   │   ├── comment.model.js      # Comment schema (user ref, post ref, desc)
│   │   └── message.model.js      # Message schema (sender ref, receiver ref, text, image, video)
│   ├── routes/
│   │   ├── auth.route.js         # /api/auth
│   │   ├── post.route.js         # /api/posts
│   │   ├── comment.route.js      # /api/comments
│   │   └── message.route.js      # /api/messages
│   └── webhooks/
│       └── clerk.webhook.js      # Clerk -> Mongo user sync (raw body + signature verify + cascade delete)
├── .env.example
└── package.json
```

Concerns are split the conventional way — routes declare endpoints, middleware guards them, controllers hold logic, models define data, `lib` holds cross-cutting infrastructure — so each new feature drops into an obvious place.

---

## API surface

Grouped by resource, in the same order as the sections above.

| Method   | Path                          | Auth            | Purpose                                                        |
| -------- | ----------------------------- | --------------- | -------------------------------------------------------------- |
| `GET`    | `/`                           | —               | Plain-text greeting, so the bare service URL isn't a 404       |
| `GET`    | `/health`                     | —               | Liveness/readiness probe                                       |
| `GET`    | `/api/auth/check`             | signed-in       | Return the current user's synced Mongo doc                     |
| `POST`   | `/api/webhooks/clerk`         | Clerk signature | Sync user create/update/delete into Mongo                      |
| `GET`    | `/api/posts`                  | —               | List posts (filter · sort · paginate)                          |
| `GET`    | `/api/posts/:slug`            | —               | Read one post (bumps visit counter)                            |
| `POST`   | `/api/posts`                  | admin           | Create a post                                                  |
| `PATCH`  | `/api/posts/feature`          | admin           | Toggle a post's featured flag                                  |
| `DELETE` | `/api/posts/:id`              | admin or owner  | Delete a post                                                  |
| `GET`    | `/api/posts/upload-auth`      | admin           | Signed params for a direct browser → ImageKit upload           |
| `GET`    | `/api/comments/:postId`       | —               | List a post's comments                                         |
| `POST`   | `/api/comments/:postId`       | signed-in       | Add a comment                                                  |
| `DELETE` | `/api/comments/:id`           | admin or owner  | Delete a comment                                               |
| `GET`    | `/api/messages/users`         | signed-in       | Every other synced user (start a new conversation)             |
| `GET`    | `/api/messages/conversations` | signed-in       | Users you've already messaged, most-recent first               |
| `GET`    | `/api/messages/:id`           | signed-in       | Full message history with one other user                       |
| `POST`   | `/api/messages/send/:id`      | signed-in       | Send text and/or one image/video; emits `newMessage`           |

---

## Request and response shapes

Reads return the resource directly; the only envelope in the API is the post list's pagination wrapper.

**`GET /api/posts?cat=development&sort=popular&page=1&limit=10`** — `200`

```json
{
  "posts": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
      "user": { "_id": "64f1a2b3c4d5e6f7a8b9c0d1", "username": "ajfm88", "img": "" },
      "title": "Building a shared backend for two features",
      "slug": "building-a-shared-backend-for-two-features",
      "desc": "Why one Express API beats two.",
      "category": "development",
      "img": "/blog/cover.png",
      "isFeatured": false,
      "visit": 42,
      "createdAt": "2026-03-15T10:00:00.000Z"
    }
  ],
  "hasMore": true
}
```

`hasMore` is counted against the *same* filtered query the page was fetched with, so it stays correct once `cat`, `author` or `search` narrow the set.

**`POST /api/posts`** — admin only, `201`

```json
{ "title": "My post", "desc": "Short summary", "category": "development", "content": "<p>Body HTML</p>", "img": "/blog/cover.png" }
```

Only those five fields are read; `user` comes from the session and `slug` is derived from the title, so authorship, `isFeatured` and `visit` can't be forged from the request body.

**`POST /api/messages/send/:id`** — `multipart/form-data`, `201`

Fields: `text` (optional) and `media` (optional — one image or video, 25 MB cap). At least one must be present. The response is the saved message, which is also emitted to the recipient's socket as `newMessage`:

```json
{
  "_id": "64f1a2b3c4d5e6f7a8b9c0d3",
  "senderId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "receiverId": "64f1a2b3c4d5e6f7a8b9c0d4",
  "text": "Look at this",
  "image": "https://ik.imagekit.io/<id>/chat/photo.jpg",
  "createdAt": "2026-03-15T10:05:00.000Z"
}
```

---

## Error handling

One [central error handler](src/index.js) formats every failure into the same shape, so controllers just `throw` and Express 5 forwards the rejection:

```json
{ "message": "Something went wrong!" }
```

| Situation                                    | Status |
| -------------------------------------------- | ------ |
| Success                                      | `200`  |
| Resource created (post, comment, message)    | `201`  |
| Bad request — missing field, bad webhook signature | `400`  |
| Not signed in, or an invalid Clerk session   | `401`  |
| Signed in but not allowed (admin-only route) | `403`  |
| Not found, or a Clerk user not yet synced    | `404`  |
| Unhandled server error                       | `500`  |
| ImageKit not configured on this deploy       | `503`  |

The `503` is deliberate rather than a `500`: an unconfigured third-party integration is a deployment state, not a bug, and the frontend can tell the user uploads are unavailable instead of showing a generic crash.

---

## Running it locally

**Prerequisites:** Node.js, a MongoDB Atlas connection string, and a Clerk application (publishable + secret keys, and a webhook signing secret).

```bash
cd server
npm install
cp .env.example .env   # then fill in the values
npm run dev            # nodemon, restarts on save
```

### Available scripts

| Script          | Description                                       |
| --------------- | ------------------------------------------------- |
| `npm run dev`   | Start with nodemon, restarting on save            |
| `npm start`     | Start without nodemon — what Render runs          |
| `npm run build` | No-op; the server ships as plain ESM, nothing to compile |

### Environment variables

| Var                            | Purpose                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `PORT`                         | Port to listen on (default `3000`)                                            |
| `NODE_ENV`                     | `development` / `production`                                                  |
| `CLIENT_URL`                   | Comma-separated CORS allowlist (SPA in dev + prod domain)                     |
| `MONGO_URI`                    | MongoDB Atlas connection string                                               |
| `CLERK_PUBLISHABLE_KEY`        | Clerk publishable key                                                         |
| `CLERK_SECRET_KEY`             | Clerk secret key                                                              |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifies inbound Clerk webhooks                                               |
| `IK_URL_ENDPOINT`              | ImageKit URL endpoint                                                         |
| `IK_PUBLIC_KEY`                | ImageKit public key                                                           |
| `IK_PRIVATE_KEY`               | Signs blog upload params and uploads chat media; never leaves this server     |

The frontend consumes the ImageKit endpoint and public key directly through its own `VITE_IK_*` vars — the private key is backend-only.

---

## Deploying (Render)

**Live at `https://3dfolio-ajfm88-server.onrender.com`.** Deployed via Render's manual **New → Web Service** flow (no Blueprint — Root Directory alone covers the monorepo split):

1. **Render → New → Web Service**, connect the `3dfolio` GitHub repo.
2. **Root Directory**: `server`. **Build Command**: `npm install`. **Start Command**: `npm start`. **Instance Type**: Free.
3. **Environment variables** — copy straight from local `server/.env`: `NODE_ENV=production`, `CLIENT_URL` (comma-separated: the Vercel origin(s) + `http://localhost:5173` for local frontend dev against the live API), `MONGO_URI`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `IK_URL_ENDPOINT`, `IK_PUBLIC_KEY`, `IK_PRIVATE_KEY`. Don't set `PORT` — Render injects its own and expects the app to bind to it. Leave `CLERK_WEBHOOK_SIGNING_SECRET` out for now, added in step 5.
4. **Health Check Path** (under Advanced): `/health`. Deploy, confirm `https://<service>.onrender.com/health` → `{ok:true}`.
5. **Clerk dashboard → Webhooks → Add endpoint** → `https://<service>.onrender.com/api/webhooks/clerk`, subscribe to `user.created` / `user.updated` / `user.deleted`. Copy the signing secret into Render's `CLERK_WEBHOOK_SIGNING_SECRET` (triggers a redeploy). Verified via Clerk's Testing tab — a sample `user.created` event delivered with a `200`.
6. **External keep-alive:** a FastCron job hits `/health` every 10 minutes so the free-tier instance doesn't spin down (Render free web services sleep after 15 min idle). Lives outside the repo by design — no in-app cron.
7. **Pre-deploy Clerk checklist — done:** `ale@ajfm88.com` has `{"role":"admin"}` set in Clerk public metadata, *and* Sessions → Customize session token includes `{ "metadata": "{{user.public_metadata}}" }` so `resolveRole` reads the role straight off the session claim rather than only the webhook-mirrored fallback. Verified end-to-end: sign in, create a post, delete a post — no 403s.

---

<a href="https://3dfolio-ajfm88-server.onrender.com/health"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render" alt="backend on render" /></a>
