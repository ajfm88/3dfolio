# Portfolio API — Shared Express Backend

The Node/Express service that powers the dynamic, authenticated parts of my portfolio: the **`/blog`** (posts + comments) and **`/chat`** (real-time messaging) features. Everything else on the site is a static 3D React front end; this server is where identity, persistence, and real-time live.

> **Status:** Foundation (slices 1–2). This commit lands the server skeleton, database + socket wiring, Clerk authentication, and the Clerk→Mongo user-sync webhook. Blog posts/comments (slices 3–4) and chat messages (chat-plan Phase A) build on top of this base.

---

## The one-line pitch

> I built one Express API that serves two different product features (a blog and a chat app) off a **single auth system, single database, and single deployment** — instead of standing up two backends. The interesting engineering is in the decisions that made that consolidation clean: where identity lives, how third-party auth stays in sync with my own data, and how I layered real-time on top of plain HTTP.

---

## Why this exists (the architectural decision that matters most)

My blog and chat features were originally two separate projects, each with its own backend, its own user table, and its own auth. Running both would have meant **two servers, two databases, two user records for the same human, and two deploys** to keep alive on a hobby budget.

I made a deliberate call to **merge them into one shared backend**:

- **One Clerk application** is the source of truth for identity across both features.
- **One MongoDB database** holds a single `users` collection that both features reference, alongside blog `posts`/`comments` and chat `messages`.
- **One Express process** (wrapped in an `http.Server` so Socket.io can ride along) serves the REST API for the blog and the WebSocket layer for chat.
- **One deployment** on Render.

The cost of that decision was reconciling two different data models and two different auth conventions into one. That reconciliation is most of what the "why" below is about.

> **I also moved this off Firebase on purpose.** The rest of my site uses Firebase (Firestore/Storage/Auth) for simple, single-author admin content. But the blog + chat need relational-style references between users, posts, comments, and messages, plus a real WebSocket server for presence and message delivery. A self-hosted Express + MongoDB + Socket.io stack models that far more naturally than Firestore's document model and gives me full control over the request lifecycle — so I chose the right tool for _this_ job rather than forcing everything into one platform.

---

## Tech stack & why each piece

| Concern        | Choice                                         | Why                                                                                                                                                             |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP framework | **Express 5**                                  | Minimal, well-understood, huge ecosystem. Express 5's native `async` error propagation keeps controllers clean.                                                 |
| Database       | **MongoDB Atlas + Mongoose**                   | Document model fits blog posts and chat messages naturally; Mongoose gives me schema validation and a typed-ish model layer over a schemaless store.            |
| Authentication | **Clerk** (`@clerk/express`)                   | Offloads the genuinely hard, high-risk parts of auth — password storage, sessions, OAuth, MFA — to a specialist. I own my app logic, not a credential database. |
| Real-time      | **Socket.io**                                  | Presence (who's online) and instant message delivery for chat, with automatic reconnection and a room/broadcast model.                                          |
| Media uploads  | **ImageKit** (`@imagekit/nodejs`) + **Multer** | Off-loads image storage, CDN delivery, and on-the-fly transforms; Multer handles the multipart upload boundary. Wired in a later slice.                         |
| Config         | **dotenv**                                     | Twelve-factor style — every secret and environment difference comes from the environment, nothing is hardcoded.                                                 |
| Dev loop       | **nodemon**                                    | Auto-restart on save.                                                                                                                                           |

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

Presence is tracked in an in-memory `userId → socketId` map. On connect I record the socket and broadcast the full online set; on disconnect I remove it and broadcast again. A `getReceiverSocketId()` helper is exported so a later slice can deliver a chat message straight to one recipient's socket. (In-memory presence is the right trade-off for a single-instance hobby deploy; scaling to multiple instances would swap this for a Redis adapter — a change I've scoped but not needed yet.)

---

## The unified data model (reconciling two schemas into one)

The single most fiddly part of merging two projects was that they modeled _the same user_ differently:

|              | Blog reference | Chat reference | My unified schema                   |
| ------------ | -------------- | -------------- | ----------------------------------- |
| Clerk key    | `clerkUserId`  | `clerkId`      | **`clerkId`**                       |
| Display name | —              | `fullName`     | `fullName`                          |
| Handle       | `username`     | —              | `username`                          |
| Avatar       | `img`          | `profilePic`   | **`img`** (canonical)               |
| Role         | —              | —              | **`role`** (added for admin gating) |
| Saved posts  | `savedPosts`   | —              | `savedPosts` (kept, harmless)       |

Rather than carry both conventions forward, I picked one canonical field name per concept ([`src/models/user.model.js`](src/models/user.model.js)) and map the other project's fields onto it during its port. Small decision, but it's the difference between a clean model and one that leaks two histories forever.

---

## Security & robustness choices worth calling out

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
│   │   └── socket.js             # http.Server + Socket.io, presence map, app/server export
│   ├── middleware/
│   │   └── auth.middleware.js    # protectRoute: Clerk session -> req.user (Mongo doc)
│   ├── controllers/
│   │   └── auth.controller.js    # checkAuth: return the synced user
│   ├── models/
│   │   └── user.model.js         # unified User schema
│   ├── routes/
│   │   └── auth.route.js         # /api/auth
│   └── webhooks/
│       └── clerk.webhook.js      # Clerk -> Mongo user sync (raw body + signature verify)
├── .env.example
└── package.json
```

Concerns are split the conventional way — routes declare endpoints, middleware guards them, controllers hold logic, models define data, `lib` holds cross-cutting infrastructure — so each new feature slice drops into an obvious place.

---

## API surface (so far)

| Method | Path                  | Auth            | Purpose                                    |
| ------ | --------------------- | --------------- | ------------------------------------------ |
| `GET`  | `/health`             | —               | Liveness/readiness probe                   |
| `GET`  | `/api/auth/check`     | Clerk session   | Return the current user's synced Mongo doc |
| `POST` | `/api/webhooks/clerk` | Clerk signature | Sync user create/update/delete into Mongo  |

Blog (`/api/posts`, `/api/comments`) and chat (`/api/messages`) routes land in upcoming slices.

---

## Running it locally

**Prerequisites:** Node.js, a MongoDB Atlas connection string, and a Clerk application (publishable + secret keys, and a webhook signing secret).

```bash
cd server
npm install
cp .env.example .env   # then fill in the values
npm run dev            # nodemon, restarts on save
```

`npm start` runs it without nodemon (what Render uses).

### Environment variables

| Var                                                    | Purpose                                                   |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `PORT`                                                 | Port to listen on (default `3000`)                        |
| `NODE_ENV`                                             | `development` / `production`                              |
| `CLIENT_URL`                                           | Comma-separated CORS allowlist (SPA in dev + prod domain) |
| `MONGO_URI`                                            | MongoDB Atlas connection string                           |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`           | Clerk API keys                                            |
| `CLERK_WEBHOOK_SIGNING_SECRET`                         | Verifies inbound Clerk webhooks                           |
| `IK_URL_ENDPOINT` / `IK_PUBLIC_KEY` / `IK_PRIVATE_KEY` | ImageKit media (used in a later slice)                    |

---

## Roadmap

- [x] **Slices 1–2 — Foundation:** server + DB + socket wiring, Clerk auth, user-sync webhook, unified User model.
- [ ] **Slices 3–4 — Blog:** Post + Comment models, CRUD routes, ImageKit uploads, cascade-delete on `user.deleted`.
- [ ] **Chat Phase A:** Message model, message routes, Socket.io delivery via `getReceiverSocketId`.

Built incrementally, one small slice per commit, on purpose — each step is reviewable on its own and the server is runnable at every commit.
