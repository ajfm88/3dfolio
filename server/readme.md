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
│   │   └── socket.js                 # http.Server + Socket.io, auth, presence map
│   ├── middleware/
│   │   ├── auth.middleware.js        # protectRoute (signed in) and requireAdmin (role gate)
│   │   ├── increaseVisit.js          # Atomic $inc of a post's visit counter
│   │   └── upload.middleware.js      # Multer config for chat media uploads
│   ├── controllers/
│   │   ├── auth.controller.js        # Returns the current synced user
│   │   ├── post.controller.js        # Post CRUD, featuring, and upload authorization
│   │   ├── comment.controller.js     # Comment list, add, and delete handlers
│   │   └── message.controller.js     # Message history, conversations, and send + emit
│   ├── models/
│   │   ├── user.model.js             # Mongoose User model — shared by both features
│   │   ├── post.model.js             # Mongoose Post model
│   │   ├── comment.model.js          # Mongoose Comment model
│   │   └── message.model.js          # Mongoose Message model
│   ├── routes/
│   │   ├── auth.route.js             # /api/auth routes
│   │   ├── post.route.js             # /api/posts routes
│   │   ├── comment.route.js          # /api/comments routes
│   │   └── message.route.js          # /api/messages routes
│   ├── webhooks/
│   │   └── clerk.webhook.js          # Clerk to MongoDB user sync and cascade deletes
│   └── index.js                      # Express app entry point
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

The server is created as an `http.Server` rather than through `app.listen()`, so Express handles REST and Socket.io handles WebSockets over the same port and process.

Sockets authenticate exactly like REST requests: the client sends its Clerk session token in `handshake.auth.token`, the server verifies it and resolves it to the synced MongoDB user. Every socket joins a room named for its user id, so emits reach all of that user's open tabs.

### Client to Server

| Event    | Payload                    | Description                               |
| -------- | -------------------------- | ----------------------------------------- |
| `typing` | `{ receiverId, isTyping }` | Relayed to the recipient, never persisted |

### Server to Client

| Event            | Payload                    | Description                               |
| ---------------- | -------------------------- | ----------------------------------------- |
| `getOnlineUsers` | `string[]` of user ids     | Broadcast on every connect and disconnect |
| `typing`         | `{ userId, isTyping }`     | Sent to the recipient's room only         |
| `newMessage`     | The saved message document | Sent to the recipient's room on send      |

Presence is an in-memory map of `userId` to a `Set` of socket ids. A user goes offline only once their last tab disconnects. Every handler is wrapped so that an exception inside one event cannot take down the process, which also serves the blog.

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
| `npm run build` | No-op, the server ships as plain ESM                    |

---

<a href="https://3dfolio-ajfm88-server.onrender.com"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render" alt="backend on render"/></a>
