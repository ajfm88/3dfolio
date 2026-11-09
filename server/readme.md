# 3dfolio — Backend (Server)

A REST API and WebSocket server built with Express 5, MongoDB, Clerk authentication, and Socket.io. The server handles all business logic, database operations, media uploads via ImageKit, and real-time message delivery for the two dynamic features of the portfolio: the blog (`/blog`) and the real-time chat (`/chat`). Both features run on a single auth system, a single database, and a single deployment.

<div align="center">
  <img src="../mern.png" alt="MERN stack — MongoDB, Express, React, Node" width="600">
</div>

## Technologies Used

| Technology    | Version | Purpose                                       |
| ------------- | ------- | --------------------------------------------- |
| Node.js       | 18+     | Runtime environment                           |
| Express       | 5       | Web framework                                 |
| MongoDB Atlas | 6+      | NoSQL database                                |
| Mongoose      | 9       | MongoDB object modeling                       |
| Clerk         | 2       | Authentication, sessions, and user management |
| Socket.io     | 4       | Real-time messaging and presence              |
| ImageKit      | 7       | Media storage, CDN delivery, and transforms   |
| Multer        | 2       | Chat media upload handling                    |
| CORS          | 2.8     | Cross-origin resource sharing                 |
| dotenv        | 17      | Environment variable management               |
| nodemon       | 3       | Hot reloading in development                  |

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- A **MongoDB Atlas** connection string
- A **Clerk** application — publishable key, secret key, and a webhook signing secret
- An **ImageKit** account — URL endpoint, public key, and private key

## Getting Started

### 1. Navigate to the Server Directory

```bash
cd server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the `server/` directory:

```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/3dfolio?appName=Cluster0
CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key
CLERK_WEBHOOK_SIGNING_SECRET=your-clerk-webhook-signing-secret
IK_URL_ENDPOINT=your-imagekit-url-endpoint
IK_PUBLIC_KEY=your-imagekit-public-key
IK_PRIVATE_KEY=your-imagekit-private-key
```

The `MONGO_URI` must include the database name between the host and the query string. Atlas hands you a string without one, and with that segment empty the driver connects to a database called `test` instead of failing.

### 4. Start the Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Environment Variables

| Variable                       | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `PORT`                         | Port to listen on (default `3000`)                           |
| `NODE_ENV`                     | `development` or `production`                                |
| `CLIENT_URL`                   | Comma-separated CORS allowlist (dev SPA + production domain) |
| `MONGO_URI`                    | MongoDB Atlas connection string, including the database name |
| `CLERK_PUBLISHABLE_KEY`        | Clerk publishable key                                        |
| `CLERK_SECRET_KEY`             | Clerk secret key — also verifies socket handshake tokens     |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifies inbound Clerk webhooks                              |
| `IK_URL_ENDPOINT`              | ImageKit URL endpoint                                        |
| `IK_PUBLIC_KEY`                | ImageKit public key                                          |
| `IK_PRIVATE_KEY`               | Signs blog upload params and uploads chat media              |

The `IK_PRIVATE_KEY` never leaves the server. The frontend consumes the ImageKit endpoint and public key through its own `VITE_IK_*` variables.

## Project Structure

```
server/
├── src/
│   ├── lib/
│   │   ├── db.js                     # MongoDB connection, exits the process on failure
│   │   ├── roles.js                  # resolveRole — Clerk claim, webhook-mirrored fallback
│   │   ├── imagekit.js               # Lazily built ImageKit client and chat media upload
│   │   ├── projectAccess.js          # Project roles, permission table, membership-scoped lookup, limits
│   │   ├── safeHandler.js            # Contains thrown errors and rejected promises in socket handlers
│   │   ├── workspaceRooms.js         # In-memory project rooms, join leases, and per-room serial queues
│   │   └── socket.js                 # Shared http.Server + Socket.io, auth, feature registration
│   ├── shared/
│   │   └── canvasOps.js              # Pure canvas op semantics shared by the server and the client
│   ├── middleware/
│   │   ├── auth.middleware.js        # protectRoute (signed in) and requireAdmin (role gate)
│   │   ├── increaseVisit.js          # Atomic $inc of a post's visit counter
│   │   └── upload.middleware.js      # Multer config for chat media uploads
│   ├── controllers/
│   │   ├── auth.controller.js        # Returns the current synced user
│   │   ├── post.controller.js        # Post CRUD, featuring, and upload authorization
│   │   ├── comment.controller.js     # Comment list, add, and delete handlers
│   │   ├── message.controller.js     # Message history, conversations, and send + emit
│   │   └── project.controller.js     # Project list, create, read, rename, and delete, scoped to membership
│   ├── models/
│   │   ├── user.model.js             # Mongoose User model — shared by both features
│   │   ├── post.model.js             # Mongoose Post model
│   │   ├── comment.model.js          # Mongoose Comment model
│   │   ├── message.model.js          # Mongoose Message model
│   │   ├── project.model.js          # Project ownership, members, and pending invites
│   │   └── canvas.model.js           # One versioned canvas snapshot per project
│   ├── routes/
│   │   ├── auth.route.js             # /api/auth routes
│   │   ├── post.route.js             # /api/posts routes
│   │   ├── comment.route.js          # /api/comments routes
│   │   ├── message.route.js          # /api/messages routes
│   │   └── project.route.js          # /api/projects routes
│   ├── sockets/
│   │   ├── chat.socket.js            # Chat presence, typing, and disconnect handlers
│   │   └── workspace.socket.js       # Workspace join, leave, and disconnect cleanup
│   ├── webhooks/
│   │   └── clerk.webhook.js          # Clerk to MongoDB user sync and cascade deletes
│   └── index.js                      # Express app entry point
├── test/
│   ├── projectAccess.test.js         # Permission table, role resolution, invalid ids, limits
│   ├── models.test.js                # Project and Canvas schema validation without a database
│   ├── canvasOps.test.js             # Canvas op validation, atomic apply, and normalization
│   ├── workspaceRooms.test.js        # Room registry and serial queue, with no database
│   └── workspace.socket.test.js      # Join, leave, and cancellation, with models stubbed
├── .env                              # Environment variables
├── .env.example
├── package.json
└── readme.md
```

## Middleware Order

The order in `src/index.js` is load-bearing:

| Order | Middleware            | Note                                                 |
| ----- | --------------------- | ---------------------------------------------------- |
| 1     | `/api/webhooks/clerk` | Mounted with `express.raw()`, before the JSON parser |
| 2     | `express.json()`      | Parses every other request body                      |
| 3     | `cors()`              | Explicit allowlist from `CLIENT_URL`, no wildcard    |
| 4     | `clerkMiddleware()`   | Attaches Clerk session context to the request        |
| 5     | Routes                | `/`, `/health`, `/api/*`                             |
| 6     | Central error handler | Formats every failure into one JSON shape            |

The Clerk webhook is mounted first because its signature is verified against the exact raw bytes of the request body. Parsing the body first re-serializes it, and the signature check then fails on a body that looks identical but is not byte-for-byte the same.

## API Endpoints

### Public Routes

| Method | Endpoint              | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| GET    | `/`                   | Plain-text greeting                               |
| GET    | `/health`             | Liveness and readiness probe, returns `{ok:true}` |
| POST   | `/api/webhooks/clerk` | Clerk user sync — requires a valid signature      |

### Auth Routes (Protected)

| Method | Endpoint          | Description                                  |
| ------ | ----------------- | -------------------------------------------- |
| GET    | `/api/auth/check` | Return the current user's synced MongoDB doc |

### Post Routes

| Method | Endpoint                 | Auth           | Description                                   |
| ------ | ------------------------ | -------------- | --------------------------------------------- |
| GET    | `/api/posts`             | Public         | List posts with filters, sorting, and paging  |
| GET    | `/api/posts/:slug`       | Public         | Get one post by slug, bumps its visit counter |
| GET    | `/api/posts/upload-auth` | Admin          | Signed params for a direct browser upload     |
| POST   | `/api/posts`             | Admin          | Create a post, slug derived from the title    |
| PATCH  | `/api/posts/feature`     | Admin          | Toggle a post's featured flag                 |
| DELETE | `/api/posts/:id`         | Admin or owner | Delete a post and cascade its comments        |

**Supported query parameters for `GET /api/posts`:**

| Parameter  | Values                                    | Description                      |
| ---------- | ----------------------------------------- | -------------------------------- |
| `cat`      | Any category slug                         | Filter by category               |
| `author`   | A username                                | Filter by author handle          |
| `search`   | Any string                                | Title search                     |
| `featured` | Truthy                                    | Return featured posts only       |
| `sort`     | `newest`, `oldest`, `popular`, `trending` | Defaults to `newest`             |
| `page`     | Number                                    | Page number, defaults to `1`     |
| `limit`    | Number                                    | Defaults to `10`, capped at `50` |

`trending` sorts by visit count within the last 7 days; `popular` sorts by all-time visits.

### Comment Routes

| Method | Endpoint                | Auth           | Description                          |
| ------ | ----------------------- | -------------- | ------------------------------------ |
| GET    | `/api/comments/:postId` | Public         | List a post's comments, newest first |
| POST   | `/api/comments/:postId` | Signed in      | Add a comment                        |
| DELETE | `/api/comments/:id`     | Admin or owner | Delete a comment                     |

### Message Routes (Protected)

All requests to `/api/messages` require a valid Clerk session. Chat has no public reads.

| Method | Endpoint                      | Description                                          |
| ------ | ----------------------------- | ---------------------------------------------------- |
| GET    | `/api/messages/users`         | Every other synced user, for starting a conversation |
| GET    | `/api/messages/conversations` | Users already messaged, most recent first            |
| GET    | `/api/messages/:id`           | Full message history with one user, oldest first     |
| POST   | `/api/messages/send/:id`      | Send text and/or one image or video                  |

Conversations are derived rather than stored. There is no `conversations` collection — the sidebar list is a MongoDB aggregation over `messages`, grouping by the other participant and keeping the most recent timestamp per group.

### Project Routes (Protected)

All requests to `/api/projects` require a valid Clerk session.

| Method | Endpoint            | Who                               | Description                             |
| ------ | ------------------- | --------------------------------- | --------------------------------------- |
| GET    | `/api/projects`     | Any signed-in user                | Owned and shared projects, newest first |
| POST   | `/api/projects`     | Any signed-in user, under the cap | Create a project                        |
| GET    | `/api/projects/:id` | Member (any role)                 | One project and the caller's role       |
| PATCH  | `/api/projects/:id` | Owner                             | Rename or change the description        |
| DELETE | `/api/projects/:id` | Owner                             | Delete the project and its canvas       |

A non-member, or a request with an invalid id, gets `404`, so a project's existence never leaks. A member without permission gets `403`.

## Authorization

All protected routes require a Clerk session token in the request header:

```
Authorization: Bearer <session_token>
```

The SPA is cross-origin (Vercel to Render), so a session cookie cannot ride along and the token is sent explicitly.

Authorization runs in two tiers:

| Middleware     | Answers            | Behavior                                                           |
| -------------- | ------------------ | ------------------------------------------------------------------ |
| `protectRoute` | Are you signed in? | Resolves the Clerk session to a MongoDB user on `req.user`         |
| `requireAdmin` | Are you allowed?   | Reads the role from the Clerk session claim, falls back to the doc |

Roles originate in Clerk's `public_metadata` and are mirrored onto the MongoDB user by the webhook. They are never read from user input, so a client cannot promote itself. Delete routes accept either an admin or the owner, scoped in the query itself (`findOneAndDelete({ _id, user: req.user._id })`) rather than a separate read-then-check.

On a missing or invalid session the server responds with:

```json
{ "message": "Unauthorized" }
```

## User Synchronization

Clerk owns identity; MongoDB owns application data. Every Clerk user has a corresponding local `User` document, kept in sync two ways:

| Mechanism   | Trigger                                        | Effect                                  |
| ----------- | ---------------------------------------------- | --------------------------------------- |
| Webhook     | `user.created`, `user.updated`, `user.deleted` | Upserts or deletes the MongoDB user     |
| Route guard | Every protected request                        | Resolves the session to the synced user |

The `user.deleted` handler cascades, removing that user's posts and comments. If a request arrives before the webhook has synced its user, the guard returns `404` rather than crashing.

## Socket.io Events

Handlers live in per-feature modules under `src/sockets/`, registered from `src/lib/socket.js`.

The server is created as an `http.Server` rather than through `app.listen()`, so Express handles REST and Socket.io handles WebSockets over the same port and process.

Sockets authenticate exactly like REST requests: the client sends its Clerk session token in `handshake.auth.token`, the server verifies it and resolves it to the synced MongoDB user. Every socket joins a room named for its user id, so emits reach all of that user's open tabs.

### Client to Server

| Event    | Payload                    | Description                               |
| -------- | -------------------------- | ----------------------------------------- |
| `typing`          | `{ receiverId, isTyping }` | Relayed to the recipient, never persisted |
| `workspace:join`  | `{ projectId, tabId }`     | Acked. Joins `project:<projectId>` and returns the saved snapshot |
| `workspace:leave` | `{ projectId }`            | Leaves that project room. No acknowledgement |
| `canvas:commit`   | `{ projectId, baseVersion, ops }` | Acked. Saves one batch when this connection may edit |
| `canvas:sync`     | `{ projectId }`            | Acked. Returns the current saved canvas for any joined role |
| `canvas:preview`  | `{ projectId, nodes: [{ id, position, width?, height? }] }` | Volatile, no ack. Emitted at most every 50ms during drag/resize. Sent only by a joined editor/owner. Nodes are 1–50; `width` and `height` are both present or both absent. |

`workspace:join` ignores a call that has no acknowledgement function. `projectId` is a 24-character hex ObjectId and `tabId` is a UUID v4; both are matched case-insensitively and stored lowercase. Any other field on the payload is ignored. The server uses the authenticated socket user, never a user id or role in the payload.

A successful acknowledgement looks like this:

```json
{
  "ok": true,
  "project": { "_id": "…", "name": "Design", "description": "" },
  "role": "owner",
  "canvas": { "nodes": [], "edges": [], "version": 0 },
  "participants": [],
  "turn": null,
  "serverNow": 1760000000000
}
```

Failures carry only `ok` and `message`. `"Project not found"` covers a bad id, a missing project, and a caller who cannot read it. `"Invalid workspace request"` covers a malformed payload or tab id. `"Workspace request superseded"` covers a join cancelled by a newer join, leave, or disconnect. `"Unable to open workspace"` covers an unexpected database or adapter failure; the server logs the cause and does not return it.

Each join checks membership with the same scoped project query as REST, including when the room is already cached. The caller's `fullName` and `img` come from the synced user document. The first join of a project upserts a Canvas with insert-only defaults, normalizes `nodes` and `edges` in memory, and keeps the stored `version`. Joining does not rewrite an existing graph or save later edits. A duplicate-key race reads the canvas that won the unique index.

The room registry is in-memory and single-process. A restart drops it; the client reconnects, joins again, and loads the stored snapshot. Joining itself does not save edits. After a join, the open tab sends each accepted gesture as `canvas:commit` and applies `canvas:ops` from other sockets, including the same user's other tabs. The confirmed version moves only when a commit is acknowledged or a snapshot is installed. Unsent edits are discarded on disconnect, route exit, sign-out, or recovery. A reject, a timeout, a version gap, or a remote edit that arrives while local work is queued replaces that optimistic graph with the server snapshot and does not replay it. A timeout still reads `canvas:sync` because the save may have landed. Until turn enforcement, two editors can commit at once; the loser resyncs instead of merging.

`canvas:commit` and `canvas:sync` ignore a call that has no acknowledgement function. `projectId` is the same 24-character hex id as join, matched without case and stored lowercase. Any other field on the envelope is ignored, including a user id, role, or `updatedBy`. `baseVersion` has to be a nonnegative integer below `Number.MAX_SAFE_INTEGER`. `ops` has to be an array of 1 to 50 entries. The shared canvas module checks each operation and is the only place that strips fields. A batch is never truncated or partly applied.

Both events require a connected socket whose finished join is still current. An in-flight join is not enough, and neither event creates a room or a canvas. A newer join, a leave for that same project, or a disconnect drops that authority immediately, even when removal of the registry connection is still queued. A leave for a different project does not. Before a save or a snapshot, the handler reads membership again with the same scoped project query as REST and refreshes the cached role. A viewer may sync and may not commit. Until turn enforcement arrives in a later slice, an owner or editor connection may commit. `canWrite` is that check. It accepts only the connection object stored on the room.

One room has one write queue. Commits and syncs for that project run in order. Two projects do not wait on each other. A queued commit or sync that loses its join, because of leave, disconnect, or a newer join, makes no write. The caller hears `"Workspace request superseded"` when that socket is still connected. A save that has already been sent to the database is not cancelled. If it matches, the room cache moves forward and `canvas:ops` is broadcast even when the sender has gone. That sender gets a success acknowledgement only when the same socket is still the joined connection.

A successful commit acknowledges `{ "ok": true, "version": 5 }` and does not return the graph. The broadcast goes to `project:<projectId>` except the sending socket, so that user's other tabs receive it. It is not volatile, it is not sent on the per-user chat room, and it is not a global emit:

```json
{ "projectId": "…", "version": 5, "ops": [], "by": "<authenticated user id>" }
```

`ops` in that event are the normalized operations, and `by` is the authenticated user. The conditional update matches `project` and `version`, sets `nodes`, `edges`, and `updatedBy` from that user, and increments `version`. Nothing is upserted. The cache changes only after `acknowledged` is true and exactly one document matched.

`"Canvas version mismatch"` includes the current `{ nodes, edges, version }` when the sender is still allowed to edit and the base version is stale, or when the conditional update matches nothing and a reload finds the saved canvas. `"You cannot edit this canvas"` is a joined viewer, with no canvas attached. `applyOps` failures use that module's message and include the unchanged canvas for the same still-authorized sender. `"Project not found"` covers a bad id, a socket that is not joined, a missing member, and a missing canvas on reload. `"Invalid canvas request"` covers a malformed envelope. `"Unable to save canvas"` and `"Unable to sync canvas"` cover database and other operational failures. Those responses are `{ "ok": false, "message" }` only. The server logs the cause and does not return it.

A write that throws, or that comes back without an acknowledgement, does not advance the cache and does not broadcast. The room then reloads the saved canvas before a later commit or sync can succeed. A reload that fails stays closed rather than serving the cache from before the uncertain write. Sync normally returns that cache without writing. It does not increment the version, broadcast, or create a canvas. A snapshot is a copy of the whitelisted fields.

The queue and the refresh flag live in this process. A restart loads the saved canvas on the next join. Two server instances would not share them. Previews and turns are not part of this protocol yet.

`tabId` comes from the tab's `sessionStorage` so a reconnect in the same tab repeats an id. Connections are still keyed by socket id, so two tabs remain two connections even when a duplicated tab copied the same id. One socket is in one project room at a time, separate from its per-user chat room. Leave and disconnect remove that socket. The room is discarded when it has no sockets, no join still in progress, and no commit or sync still holding it. A held save keeps the same cache and queue, so a join that arrives during that save waits for it and then reads the saved version.

### Server to Client

| Event            | Payload                    | Description                               |
| ---------------- | -------------------------- | ----------------------------------------- |
| `getOnlineUsers` | `string[]` of user ids     | Broadcast on every connect and disconnect |
| `typing`         | `{ userId, isTyping }`     | Sent to the recipient's room only         |
| `newMessage`     | The saved message document | Sent to the recipient's room on send      |
| `canvas:ops`     | `{ projectId, version, ops, by }` | After a saved commit, to the project room except the sender |
| `canvas:preview` | `{ projectId, by, nodes }` | Volatile relay of a drag/resize sample. `by` is the authenticated Mongo userId. Sent to the project room except the sender. Overlay expires 3s after last sample; a canonical position/size update clears it immediately. Turn-holding is still S20. |

Presence is an in-memory map of `userId` to a `Set` of socket ids. A user goes offline only once their last tab disconnects. Every handler is wrapped so that an exception inside one event cannot take down the process, which also serves the blog. Workspace join acknowledges on the same event instead of emitting a second one.

## Request & Response Examples

### GET `/api/posts?cat=development&sort=popular&page=1&limit=10`

**Response:**

```json
{
  "posts": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
      "user": {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "username": "ajfm88",
        "img": ""
      },
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

`hasMore` is counted against the same filtered query the page was fetched with, so it stays correct once `cat`, `author`, or `search` narrows the set.

### POST `/api/posts`

**Request body:**

```json
{
  "title": "My post",
  "desc": "Short summary",
  "category": "development",
  "content": "<p>Body HTML</p>",
  "img": "/blog/cover.png"
}
```

Only those five fields are read. `user` comes from the session and `slug` is derived from the title, so authorship, `isFeatured`, and `visit` cannot be set from the request body.

### POST `/api/messages/send/:id`

Sent as `multipart/form-data` with `text` (optional) and `media` (optional, one image or video). At least one must be present.

**Response:**

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

The same document is emitted to the recipient's room as `newMessage`.

### GET `/api/projects`

**Response:**

```json
{
  "owned": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d5",
      "name": "Checkout service",
      "description": "Payment path and the services around it.",
      "role": "owner",
      "memberCount": 1,
      "owner": {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "fullName": "Alejandro Foucault",
        "img": ""
      },
      "createdAt": "2026-03-15T10:00:00.000Z",
      "updatedAt": "2026-03-15T10:00:00.000Z"
    }
  ],
  "shared": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d6",
      "name": "Edge cache",
      "description": "",
      "role": "editor",
      "memberCount": 2,
      "owner": {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "fullName": "Sam Rivera",
        "img": ""
      },
      "createdAt": "2026-03-14T10:00:00.000Z",
      "updatedAt": "2026-03-16T10:00:00.000Z"
    }
  ]
}
```

List items never include `invites`.

### GET `/api/projects/:id`

Called as the owner.

**Response:**

```json
{
  "project": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d5",
    "name": "Checkout service",
    "description": "Payment path and the services around it.",
    "owner": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "fullName": "Alejandro Foucault",
      "img": ""
    },
    "members": [
      {
        "user": {
          "_id": "64f1a2b3c4d5e6f7a8b9c0d4",
          "fullName": "Sam Rivera",
          "img": ""
        },
        "role": "editor",
        "addedAt": "2026-03-16T12:00:00.000Z"
      }
    ],
    "invites": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d7",
        "email": "teammate@example.com",
        "role": "viewer",
        "invitedBy": "64f1a2b3c4d5e6f7a8b9c0d1",
        "createdAt": "2026-03-16T12:30:00.000Z"
      }
    ],
    "createdAt": "2026-03-15T10:00:00.000Z",
    "updatedAt": "2026-03-16T12:30:00.000Z"
  },
  "role": "owner"
}
```

A non-owner member receives no `invites` key. It is absent, not an empty array.

## Database Schema

### Users Collection

Written by the Clerk webhook, never by user input. One canonical field per concept, shared by both features.

```
{
  _id:        ObjectId,
  clerkId:    String (unique, the join back to Clerk),
  email:      String (unique),
  fullName:   String (chat display name),
  username:   String (blog author handle),
  img:        String (avatar, used by both features),
  role:       String (user | admin),
  savedPosts: [String],
  createdAt:  Date,
  updatedAt:  Date
}
```

### Posts Collection

```
{
  _id:        ObjectId,
  user:       ObjectId (ref: User),
  title:      String,
  slug:       String (unique, URL-safe),
  desc:       String,
  category:   String (defaults to "general"),
  content:    String (rich-text HTML),
  img:        String (ImageKit CDN URL),
  isFeatured: Boolean,
  visit:      Number,
  createdAt:  Date,
  updatedAt:  Date
}
```

### Comments Collection

```
{
  _id:       ObjectId,
  user:      ObjectId (ref: User),
  post:      ObjectId (ref: Post),
  desc:      String,
  createdAt: Date,
  updatedAt: Date
}
```

### Messages Collection

```
{
  _id:        ObjectId,
  senderId:   ObjectId (ref: User),
  receiverId: ObjectId (ref: User),
  text:       String (optional),
  image:      String (optional, ImageKit URL),
  video:      String (optional, ImageKit URL),
  createdAt:  Date,
  updatedAt:  Date
}
```

### Projects Collection

```
{
  _id:         ObjectId,
  name:        String (required, trimmed, 1–80 characters),
  description: String (default: "", trimmed, max 500 characters),
  owner:       ObjectId (ref: User, required, indexed),
  members:     [{                       // default: []; no subdocument _id
    user:      ObjectId (ref: User, required),
    role:      String (required, enum: "editor" | "viewer"),
    addedAt:   Date (default: Date.now)
  }],
  invites:     [{                       // default: []; each invite keeps its _id
    _id:       ObjectId,
    email:     String (required, lowercase, trimmed),
    role:      String (required, enum: "editor" | "viewer"),
    invitedBy: ObjectId (ref: User, required),
    createdAt: Date (default: Date.now)
  }],
  createdAt:   Date,
  updatedAt:   Date
}
Indexes: { owner: 1 }, { "members.user": 1 }, { "invites.email": 1 }
```

The owner isn't stored in `members`; ownership takes priority when resolving a role.

### Canvases Collection

```
{
  _id:       ObjectId,
  project:   ObjectId (ref: Project, required, unique),
  nodes:     [Mixed] (default: []),
  edges:     [Mixed] (default: []),
  version:   Number (default: 0, min: 0),
  updatedBy: ObjectId (ref: User, optional),
  createdAt: Date,
  updatedAt: Date
}
Index: { project: 1 } (unique)
```

Canvas content is validated field by field by the shared canvas ops module (S06), not the schema. The first workspace join creates an empty snapshot if one does not exist. Join normalizes the loaded graph in memory and does not write that normalized graph back. Edits made after the snapshot loads are committed by the client (S15) through `canvas:commit`. A reconnect loads the stored snapshot again and drops anything that was still unsent.

## Validation Rules

### Posts

| Field      | Rules                                              |
| ---------- | -------------------------------------------------- |
| `title`    | Required                                           |
| `content`  | Required                                           |
| `slug`     | Derived from the title, unique, collision-suffixed |
| `desc`     | Optional, defaults to an empty string              |
| `category` | Optional, defaults to `general`                    |
| `img`      | Optional, ImageKit path                            |

### Comments

| Field  | Rules                                     |
| ------ | ----------------------------------------- |
| `desc` | Required                                  |
| `user` | Set from the session, never from the body |
| `post` | Set from the URL parameter                |

### Media Uploads

| Rule             | Blog covers                         | Chat media              |
| ---------------- | ----------------------------------- | ----------------------- |
| Path             | Browser directly to ImageKit        | Through the server      |
| Accepted formats | Images                              | `image/*` and `video/*` |
| Max file size    | ImageKit account limit              | 25 MB                   |
| Authorization    | Admin, signed params, 30 min expiry | Signed-in session       |

Blog covers upload straight from the browser because the editor references the returned URL in a later step. Chat media goes through the server because `sendMessage` needs the media URL before it can save the message and emit it over the socket.

## Error Handling

All errors are handled by the central error handler in `src/index.js`. Every error response follows the same structure:

```json
{ "message": "Something went wrong!" }
```

| Situation                                    | Status Code |
| -------------------------------------------- | ----------- |
| Success                                      | 200         |
| Resource created                             | 201         |
| Bad request, or an invalid webhook signature | 400         |
| Not signed in, or an invalid session         | 401         |
| Signed in but not permitted                  | 403         |
| Not found, or a Clerk user not yet synced    | 404         |
| Unhandled server error                       | 500         |
| ImageKit not configured on this deployment   | 503         |

The `503` is deliberate. An unconfigured third-party integration is a deployment state rather than a bug, so the frontend can report that uploads are unavailable instead of a generic crash.

## Deployment

The service is deployed on Render as a Web Service.

| Setting           | Value         |
| ----------------- | ------------- |
| Root Directory    | `server`      |
| Build Command     | `npm install` |
| Start Command     | `npm start`   |
| Health Check Path | `/health`     |

Set every environment variable except `PORT`, which Render injects and expects the app to bind to. `CLIENT_URL` holds the comma-separated production origin plus `http://localhost:5173` for local frontend development against the live API.

The Clerk webhook endpoint is registered in the Clerk dashboard as `https://<service>.onrender.com/api/webhooks/clerk`, subscribed to `user.created`, `user.updated`, and `user.deleted`, with its signing secret set as `CLERK_WEBHOOK_SIGNING_SECRET`. Clerk sessions are customized to include `{ "metadata": "{{user.public_metadata}}" }` so the role is readable straight off the session claim.

An external cron job hits `/health` every 10 minutes to keep the free-tier instance from spinning down after 15 minutes of inactivity. It lives outside the repo by design.

## Available Scripts

| Script          | Description                                             |
| --------------- | ------------------------------------------------------- |
| `npm run dev`   | Start development server with hot reloading via nodemon |
| `npm start`     | Start without nodemon — what Render runs                |
| `npm test`      | Run unit tests for pure server modules with `node:test` |
| `npm run build` | No-op, the server ships as plain ESM                    |

---

<a href="https://3dfolio-ajfm88-server.onrender.com"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render" alt="backend on render"/></a>
