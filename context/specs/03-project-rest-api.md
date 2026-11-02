# Slice 03: Project REST API

**Lane:** server · **Depends on:** S02 · **Unblocks:** S05, S26

## Goal

Signed-in users can list, create, read, rename, describe, and delete projects over REST at `/api/projects`. Every read and write is scoped to membership in the query itself. A non-member, or a request with an invalid id, gets `404` and learns nothing about the project. A member without permission gets `403`.

Nothing realtime yet: no socket events, no canvas creation (S13 upserts it lazily), no invites or member management (S26).

## Design

No UI changes. New and changed files:

```text
server/
├── readme.md                          ← edit: structure tree, Project Routes, examples
├── src/
│   ├── index.js                       ← edit: mount /api/projects (two lines)
│   ├── lib/
│   │   └── projectAccess.js           ← edit: add parseProjectInput (pure)
│   ├── controllers/
│   │   └── project.controller.js      ← new
│   └── routes/
│       └── project.route.js           ← new
└── test/
    └── projectAccess.test.js          ← edit: parseProjectInput tests
```

### Endpoints

All routes require a Clerk session (`protectRoute`), so `me` below is `req.user._id`.

| Method | Path | Who | Success |
| --- | --- | --- | --- |
| GET | `/api/projects` | Any signed-in user | `200 { owned: [Item], shared: [Item] }` |
| POST | `/api/projects` | Any signed-in user, under the cap | `201 { project: Item }` |
| GET | `/api/projects/:id` | Member (any role) | `200 { project: Detail, role }` |
| PATCH | `/api/projects/:id` | Owner | `200 { project: Item }` |
| DELETE | `/api/projects/:id` | Owner | `200 { message: "Project deleted" }` |

**`Item`** (list entries, and the create and rename responses):

```js
{
  _id, name, description,
  role,                                   // "owner" | "editor" | "viewer", for the caller
  memberCount,                            // members.length + 1: everyone with access, owner included
  owner: { _id, fullName, img } | null,   // null if the owner's User doc is gone (S27 cascades this)
  createdAt, updatedAt
}
```

**`Detail`** (`GET /:id`):

```js
{
  _id, name, description,
  owner: { _id, fullName, img } | null,
  members: [{ user: { _id, fullName, img }, role, addedAt }],   // entries whose user no longer exists are omitted
  invites: [{ _id, email, role, invitedBy, createdAt }],        // key present ONLY when the caller is the owner
  createdAt, updatedAt
}
```

`invitedBy` is the raw ObjectId, not populated. For a non-owner, the `invites` key is **absent**, not an empty array: invitee emails are the owner's business.

### Status codes

| Situation | Status | `message` |
| --- | --- | --- |
| No session | `401` | from `protectRoute` (unchanged) |
| Invalid body field | `400` | the specific `parseProjectInput` message |
| Already own 20 projects | `400` | `"You can own at most 20 projects"` |
| Invalid id, missing project, or caller not a member | `404` | `"Project not found"` |
| Member, but not the owner, on PATCH/DELETE | `403` | `"Only the project owner can do that"` |

Use exactly these strings. The client toasts the server's `message`.

## Implementation

### `server/src/lib/projectAccess.js` (edit)

Add one pure, named export below the existing ones. Change nothing else in the file.

**`parseProjectInput(body, { partial })` → `{ ok: true, value } | { ok: false, message }`**

- `body` is whatever `req.body` is. In Express 5 it's `undefined` when no JSON body was sent. Treat `undefined`, `null`, arrays, and non-objects as `{}`. Never throw.
- Only `name` and `description` are read. Every other key is ignored, so `owner`, `members`, `invites`, and `_id` can never be mass-assigned. `value` contains only keys the caller should write.
- **`name`**
  - Absent (`undefined`):
    - with `partial: false` (create) → `value.name = "Untitled project"`
    - with `partial: true` (update) → omitted from `value`
  - Present but not a string (including `null`) → `{ ok: false, message: "Name must be text" }`
  - A string → trimmed.
    - Empty after trimming: on create, becomes `"Untitled project"`; on update → `{ ok: false, message: "Name can't be empty" }`
    - Longer than `PROJECT_NAME_MAX` after trimming → `{ ok: false, message: "Name must be 80 characters or fewer" }`
- **`description`**
  - Absent:
    - on create → `value.description = ""`
    - on update → omitted
  - Present but not a string (including `null`) → `{ ok: false, message: "Description must be text" }`
  - A string → trimmed. Longer than `PROJECT_DESCRIPTION_MAX` after trimming → `{ ok: false, message: "Description must be 500 characters or fewer" }`
- With `partial: true`, if neither field is present → `{ ok: false, message: "Nothing to update" }`.
- Build the messages from the constants, not literals, so a limit change can't leave a stale message.
- Validation happens here rather than relying on the schema alone, because a Mongoose `ValidationError` reaches the central handler as a `500`. The comment should say so.

### `server/src/controllers/project.controller.js` (new)

Named async exports: `listProjects`, `createProject`, `getProject`, `updateProject`, `deleteProject`. Express 5 forwards rejections, so no `try/catch`. Imports: `Project`, `Canvas`, and the helpers and constants from `../lib/projectAccess.js`. Nothing from chat, the blog, or `lib/socket.js`.

**Owner and member population.** Use one module-level constant, `const USER_FIELDS = "_id fullName img";`, for every populate. Never expose `email` or `clerkId` of other users.

**Private helper `toItem(project, role)`.** It takes a lean project with `owner` populated and returns the `Item` shape exactly. It reads `members` only to count them.

**`listProjects`**

- Two queries, both `.select("name description owner members createdAt updatedAt")`, `.populate("owner", USER_FIELDS)`, `.sort({ updatedAt: -1 })`, `.lean()`:
  - owned: `{ owner: me }`
  - shared: `{ "members.user": me, owner: { $ne: me } }`. The `$ne` keeps a stray owner-as-member entry from listing the project twice.
- `invites` are never selected here.
- Owned items get role `"owner"`. Shared items get `roleOf(project, me)`. Drop any shared project whose `roleOf` is `null` (a malformed member role), rather than returning a `role: null` item.
- Respond `200 { owned, shared }`.

**`createProject`**

1. `parseProjectInput(req.body, { partial: false })`. On failure → `400 { message }`.
2. `Project.countDocuments({ owner: me })`. If it's `>= MAX_OWNED_PROJECTS` → `400 "You can own at most 20 projects"`. Two simultaneous creates at 19 could both pass this check. That's accepted, because the cap is abuse protection, not an invariant. Say so in a comment.
3. `Project.create({ ...value, owner: me })`. No members and no invites. Don't create a canvas.
4. Re-read it with `Project.findById(created._id).select(...).populate("owner", USER_FIELDS).lean()` and respond `201 { project: toItem(doc, "owner") }`.

**`getProject`**

1. `findProjectForMember(req.params.id, me)`. If it's `null` → `404`.
2. `role = roleOf(project, me)`. If it's `null` (a malformed member entry) → `404`, the same as a non-member.
3. `await Project.populate(project, [{ path: "owner", select: USER_FIELDS }, { path: "members.user", select: USER_FIELDS }])`. This works on the lean object `findProjectForMember` returns.
4. Build `Detail`: drop members whose populated `user` is `null`. Include `invites` (mapped to exactly `{ _id, email, role, invitedBy, createdAt }`) **only if `role === "owner"`**. Don't spread the raw document.
5. Respond `200 { project: detail, role }`.

**`updateProject`**

1. `findProjectForMember(req.params.id, me)`. If it's `null` → `404`.
2. If `!can(roleOf(project, me), "manage")` → `403`.
3. `parseProjectInput(req.body, { partial: true })`. On failure → `400`. This runs after the access check, so a non-member can't use validation messages to probe whether a project exists.
4. `Project.findOneAndUpdate({ _id: project._id, owner: me }, { $set: value }, { returnDocument: "after", runValidators: true })`, with the same `.select`, `.populate("owner", USER_FIELDS)`, and `.lean()`.
   - The `owner: me` stays in the query even though step 2 checked it (invariant 2).
   - Use `returnDocument: "after"`, not `new: true`, which Mongoose 9 deprecates.
5. If it returns `null` (deleted in between) → `404`. Otherwise `200 { project: toItem(doc, "owner") }`.

**`deleteProject`**

1. `findProjectForMember`, then `404`. Then `can(..., "manage")`, then `403`, the same as update.
2. `Project.deleteOne({ _id: project._id, owner: me })`. If `deletedCount === 0` → `404`.
3. `Canvas.deleteOne({ project: project._id })`. It's fine if no canvas exists yet.
4. `200 { message: "Project deleted" }`.

A comment notes that project messages (S23) and kicking connected members (S27) join this cascade later. Don't add placeholders or `TODO`s for them.

### `server/src/routes/project.route.js` (new)

```js
const router = express.Router();
router.use(protectRoute);
router.get("/", listProjects);
router.post("/", createProject);
router.get("/:id", getProject);
router.patch("/:id", updateProject);
router.delete("/:id", deleteProject);
export default router;
```

Add one comment above the routes saying that static paths S26 adds (`/invites/mine`, `/invites/:inviteId/...`) must be declared before `/:id`, the same ordering rule as `post.route.js`.

### `server/src/index.js` (edit: route mounting only)

- Import `projectRoutes from "./routes/project.route.js"`.
- `app.use("/api/projects", projectRoutes);` after the `/api/messages` mount, before the central error handler.
- Nothing else changes in this file. In particular, don't touch the landing text, CORS, or middleware order.

### `server/test/projectAccess.test.js` (edit)

Add a `describe("parseProjectInput")` block. Change no existing test.

- **Create (`partial: false`):**
  - `undefined`, `null`, `[]`, `"x"`, and `{}` → `{ name: "Untitled project", description: "" }`
  - `"   "` as name → `"Untitled project"`
  - `"  Infra  "` → `"Infra"`
  - an 80-character name passes and an 81-character one fails; the same at the boundary of 500/501 for description
  - names are measured after trimming: 80 characters plus surrounding spaces passes
  - `name: 5`, `name: null`, `description: {}`, and `description: null` each fail with the right message
  - extra keys (`owner`, `members`, `invites`, `_id`) never appear in `value`
- **Update (`partial: true`):**
  - `{}` / `undefined` → `"Nothing to update"`
  - only `name`, or only `description`, gives a `value` with just that key
  - `name: "   "` → `"Name can't be empty"`
  - `description: ""` is allowed, since it clears the description
  - extra keys are ignored, and a body with only extra keys → `"Nothing to update"`
- The input object is not mutated, and the function never throws.

No tests for the controller. It does I/O, and it's verified by hand below.

### `server/readme.md` (edit)

- **Project Structure:** add `controllers/project.controller.js` ("Project list, create, read, rename, and delete, scoped to membership") and `routes/project.route.js` ("/api/projects routes"), in tree order and alignment.
- **API Endpoints:** a new **Project Routes (Protected)** section after Message Routes:
  - the endpoint table above, in the existing column style (Method · Endpoint · Who · Description)
  - one paragraph: non-members and invalid ids get `404` so a project's existence never leaks; members without permission get `403`
- **Request & Response Examples:** add `GET /api/projects` (one owned and one shared item) and `GET /api/projects/:id` as the owner (showing `invites`), plus one sentence that non-owners receive no `invites` key.
- Error Handling: no change, since the codes already exist.

### Out of scope

- Invites and members endpoints (S26), the socket kick on delete (S27), and project messages (S23).
- Any change to `protectRoute`, other routes, models, or the webhook.
- Any client code.

## Dependencies

- None new.

## Verify when done

Local server against the **live** database (Q2). Test data must be cleaned up afterwards: delete every project you created, and no fake `users` documents.

- [ ] `cd server && npm test` passes, with no warnings, including the new `parseProjectInput` block.
- [ ] `node --check` on every new or changed source file.
- [ ] `npm run dev` boots with `Server is up and running` and `MongoDB connected: … / <db name>`, with no errors or Mongoose warnings.
- [ ] Without a token: `curl -i localhost:3000/api/projects`, `curl -i -X POST …/api/projects`, and `curl -i …/api/projects/<any id>` all return `401`.
- [ ] With two real accounts A and B. Get a token from a signed-in tab's console with `await window.Clerk.session.getToken()`; tokens are short-lived, so fetch one per request batch.
  - [ ] A `POST {}` → `201`, with name `"Untitled project"`, role `"owner"`, and `memberCount: 1`.
  - [ ] A `POST` with an 81-character name → `400` with the message, and nothing is created.
  - [ ] A `POST` with `{ "owner": "<B's id>", "members": [...] }` → the project is owned by A and has no members.
  - [ ] A `GET /` → the project is in `owned` and not in `shared`, and no item contains `invites`.
  - [ ] A `GET /:id` → `200`, `role: "owner"`, and an `invites: []` key.
  - [ ] A `PATCH` with a new name → `200`, and the name is trimmed. `PATCH {}` → `400 "Nothing to update"`.
  - [ ] B `GET`, `PATCH`, and `DELETE` on A's project → all `404`, with identical bodies.
  - [ ] Ids `not-an-id`, `aaaaaaaaaaaa`, and a well-formed but nonexistent id → `404` for each verb, never `500`.
  - [ ] The member path: B as a member gets `403` on PATCH and DELETE, gets `200` on GET without an `invites` key, and appears in B's `shared`. There's no invite API until S26, so add B to `members` with a one-off `updateOne` from a scratch script (not committed), then remove them.
  - [ ] A `DELETE` → `200`, after which `GET /:id` → `404`, and no `canvases` document remains for that id. Seed one with a scratch `Canvas.create` beforehand to prove the cascade.
  - [ ] The owned cap: with 20 owned projects (scratch-seeded), the next `POST` → `400 "You can own at most 20 projects"`. Then clean up.
- [ ] `/blog` still loads posts against the local server.
- [ ] `/chat` still sends and receives a DM against the local server.
- [ ] `npm run build` at the repo root passes. No client files change.
- [ ] `git status` shows only the files listed in Design, plus `context/6-progress-tracker.md`. No scratch scripts are left in the repo.
- [ ] `server/readme.md` updated as described.
- [ ] `context/6-progress-tracker.md`: S03 marked **Ready for review** with a slice note.
