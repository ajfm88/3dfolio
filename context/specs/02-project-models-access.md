# Slice 02: Project and Canvas Models, Access Helpers, Test Harness

**Lane:** server · **Depends on:** S01 (committed `421a99a`) · **Unblocks:** S03, S06

## Goal

Add the two durable collections `/collaborate` stands on, `projects` and `canvases`, and the single module every later slice uses to answer "what is this user's role here, and may they do this?" Add the `node:test` harness so pure server modules ship with unit tests from now on.

Nothing is mounted or wired yet: no routes, no socket handlers, and no changes to `index.js`. S03 is the first consumer.

## Design

No UI changes. New and changed files:

```text
server/
├── package.json                       ← edit: add the "test" script only
├── readme.md                          ← edit: structure tree, Database Schema, Available Scripts
├── src/
│   ├── lib/
│   │   └── projectAccess.js           ← new: roleOf, can, findProjectForMember, limits
│   └── models/
│       ├── project.model.js           ← new
│       └── canvas.model.js            ← new
└── test/
    ├── projectAccess.test.js          ← new
    └── models.test.js                 ← new
```

`projectAccess.js` imports `project.model.js`, and nothing imports `projectAccess.js` yet.

## Implementation

### `server/src/models/project.model.js` (new)

Default export `mongoose.model("Project", projectSchema)`, in the style of the existing models (a `why` comment above the schema, `{ timestamps: true }`).

Fields, exactly per `2-architecture.md` → Collections:

| Field | Definition |
| --- | --- |
| `name` | `String`, `required`, `trim`, `minlength: 1`, `maxlength: 80` |
| `description` | `String`, `default: ""`, `trim`, `maxlength: 500` |
| `owner` | `ObjectId`, `ref: "User"`, `required`, `index: true` |
| `members` | array of a sub-schema `{ user: ObjectId ref "User" required, role: String enum ["editor", "viewer"] required, addedAt: Date default Date.now }`, with `{ _id: false }`, `default: []` |
| `invites` | array of a sub-schema `{ email: String required lowercase trim, role: String enum ["editor", "viewer"] required, invitedBy: ObjectId ref "User" required, createdAt: Date default Date.now }`, `default: []` |

- Members have **no** `_id`, because a member is addressed by `user` (S26 routes use `:userId`). Invites **keep** their default `_id`, because S26 addresses them by `:inviteId`.
- Indexes: `owner` via `index: true` on the field, plus `projectSchema.index({ "members.user": 1 })` and `projectSchema.index({ "invites.email": 1 })`. No other indexes.
- The owner is never stored in `members`. Say so in the schema comment: `roleOf` (below) is what makes a stray owner entry harmless.
- Use the literal enum `["editor", "viewer"]` here. **Don't import `projectAccess.js`** from the model, because that would be a circular import. A test (below) asserts that the two stay equal.

### `server/src/models/canvas.model.js` (new)

Default export `mongoose.model("Canvas", canvasSchema)`.

| Field | Definition |
| --- | --- |
| `project` | `ObjectId`, `ref: "Project"`, `required`, `unique: true` |
| `nodes` | `[mongoose.Schema.Types.Mixed]`, `default: []` |
| `edges` | `[mongoose.Schema.Types.Mixed]`, `default: []` |
| `version` | `Number`, `default: 0`, `min: 0` |
| `updatedBy` | `ObjectId`, `ref: "User"` (not required: a freshly upserted canvas has no editor yet) |

`{ timestamps: true }`. The comment must say why `nodes` and `edges` are `Mixed`: the schema doesn't validate canvas content, because `server/src/shared/canvasOps.js` (S06) whitelists every node and edge field by field on every write and every load (invariant 5). Mongoose validation would be a second, drifting copy of those rules.

No other indexes. `unique: true` on `project` creates the only one.

### `server/src/lib/projectAccess.js` (new)

Named exports only:

**Constants**

```js
export const MEMBER_ROLES = ["editor", "viewer"];
export const MAX_OWNED_PROJECTS = 20;
export const MAX_PROJECT_SEATS = 10;      // members + pending invites, excluding the owner
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 500;
```

Canvas limits belong to `canvasOps.js` (S06), and chat limits are added in S23. Don't add them here.

**`roleOf(project, userId)` → `"owner" | "editor" | "viewer" | null`** (pure)

- Works on a lean document or a hydrated one, populated or not. `project.owner` and `members[i].user` may each be an `ObjectId`, a hex string, or a populated object with `_id`. `userId` may be an `ObjectId` or a hex string.
- Normalize ids with a small private helper that returns a string or `null`, and fails closed:
  - a string → itself
  - a `mongoose.Types.ObjectId` → its hex string
  - an object whose `_id` is a string or an ObjectId → that id as a string (a populated doc)
  - **anything else** (`null`, `undefined`, plain objects, `Date`, numbers, arrays, `{ _id: null }`) → `null`

  Never `String()` an arbitrary value: two unrelated objects both stringify to `"[object Object]"` and would match. Compare strings only.
- Rules, in order:
  1. `project` isn't a non-null object, or `userId` normalizes to `null` or `""` → `null`.
  2. The owner id matches → `"owner"`. The owner wins even if the owner also appears in `members`.
  3. `project.members` isn't an array → `null`.
  4. The **first** member entry whose user id matches: if its `role` is in `MEMBER_ROLES`, return the role. Otherwise return `null`, and don't fall through to later entries.
  5. Otherwise → `null`.
- Never throws, including on `members: [null]` or an entry without `user`.

**`can(role, action)` → `boolean`** (pure)

The permission table from `2-architecture.md` → Auth and Access Model, as a frozen lookup:

| Action | owner | editor | viewer |
| --- | :-: | :-: | :-: |
| `view` | ✓ | ✓ | ✓ |
| `chat` | ✓ | ✓ | ✓ |
| `edit` | ✓ | ✓ | — |
| `reclaim` | ✓ | — | — |
| `manage` | ✓ | — | — |
| `leave` | — | ✓ | ✓ |

- An unknown role (including `null`) or an unknown action → `false`.
- Look up with `Object.hasOwn`, so inherited names like `"toString"` or `"__proto__"` return `false` instead of something truthy.

**`findProjectForMember(projectId, userId)` → `Promise<lean project | null>`**

- If `!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(userId)`, return `null` **without querying**, so a bad id is a `404` upstream and never a `CastError`.
- Otherwise: `Project.findOne({ _id: projectId, $or: [{ owner: userId }, { "members.user": userId }] }).lean()`. Membership is enforced inside the query (invariant 2). No populate, because callers that need names populate themselves (S03).
- The comment says why membership lives in the query: a read-then-check would load other people's projects into memory first, and a single scoped query can't leak whether a project exists.

The module's header comment states that `roleOf` and `can` are pure and safe to call anywhere, while `findProjectForMember` is the one function with I/O.

### `server/package.json` (edit)

Add exactly one script: `"test": "node --test"`. Don't add, remove, or bump any dependency. In particular, leave the undeclared `@clerk/backend` alone (it's noted in the tracker and out of scope).

### `server/test/projectAccess.test.js` (new)

Use `node:test` (`describe`/`it` or `test`) and `node:assert/strict`. Import `../src/lib/projectAccess.js` directly. Use `new mongoose.Types.ObjectId()` for ids. **Never call anything that reaches the database.** Mongoose would buffer the query and the test would hang.

Must cover:

- **`can`: every cell of the table above.** That's 6 actions × 3 roles = 18 assertions, table-driven, plus:
  - `null`, `undefined`, `"admin"`, and `"Owner"` (wrong case) as the role, all `false` for every action
  - an unknown action (`"delete"`) and `"toString"` / `"__proto__"`, all `false` for `"owner"`
- **`roleOf`:**
  - owner, editor, and viewer each resolved, with ObjectId ids on both sides
  - the same, with string ids on one side and ObjectIds on the other, both ways round
  - populated shapes: `owner: { _id, fullName }` and `members: [{ user: { _id }, role }]`
  - not a member → `null`
  - the owner also listed in `members` as `"viewer"` → `"owner"`
  - duplicate member entries → the first entry's role
  - a member entry with an invalid role (`"admin"`) → `null`, even when a later entry for the same user is valid
  - `project` is `null`, `undefined`, or a string; `userId` is `null`, `undefined`, or `""` → `null`
  - `members` missing, `null`, or not an array; `members: [null, {}]` → `null`, no throw
  - non-id values never match each other: `roleOf({ owner: {} }, {})`, `roleOf({ owner: new Date(0) }, new Date(0))`, `roleOf({ owner: 5 }, 5)`, `roleOf({ owner: { _id: null } }, "null")`, and the same shapes as a member `user` → `null`
- **`findProjectForMember`:** invalid inputs resolve to `null` without a query: `"not-an-id"`, `"aaaaaaaaaaaa"` (12 characters), `null`, `{}`, `123`, and a valid project id paired with an invalid user id. These return before any query, so they're safe to run with no connection.
- **Constants:** the values match the Limits table in `2-architecture.md`.

### `server/test/models.test.js` (new)

Pure schema checks with `await doc.validate()` (expect it to resolve, or use `assert.rejects` and inspect `error.errors[path]`) and `Model.schema`, with no connection. Don't use `validateSync()`: it's deprecated in Mongoose 9 and prints a warning on every call.

- **Project:**
  - a valid doc passes
  - a missing `name`, a whitespace-only `name` (trimmed to empty), an 81-character `name`, and a 501-character `description` fail
  - a member role `"owner"` and an invite role `"admin"` fail
  - an invite `email` of `"  Sam@Example.COM "` is stored as `"sam@example.com"`
  - `members` subdocs have no `_id`, and `invites` subdocs do
  - `Project.schema.indexes()` contains `{ "members.user": 1 }` and `{ "invites.email": 1 }`, and the `owner` path is indexed
  - the `members.role` and `invites.role` enums both deep-equal `MEMBER_ROLES`, which guards against drift
- **Canvas:**
  - a valid doc defaults to `nodes: []`, `edges: []`, and `version: 0`
  - a missing `project` fails, and `version: -1` fails
  - `project` is unique
  - `nodes` accepts arbitrary objects. This documents that validation is `canvasOps`'s job, not the schema's.

### `server/readme.md` (edit)

- **Project Structure:**
  - add `lib/projectAccess.js` ("Project roles, permission table, membership-scoped lookup, limits")
  - add `models/project.model.js` and `models/canvas.model.js`
  - add a `test/` directory at the `src/` level
  - all in the existing tree style and alignment
- **Database Schema:** add **Projects Collection** and **Canvases Collection** blocks after Messages, in the existing code-block style: field, type, ref, constraints, the `members`/`invites` sub-shapes, and the indexes. Under Projects, one sentence saying the owner isn't stored in `members`. Under Canvases, one sentence saying content is validated by the shared canvas ops module, not the schema.
- **Available Scripts:** add a `npm test` row ("Run unit tests for pure server modules with `node:test`").
- Leave the API and Socket.io tables alone, because nothing is mounted yet.

### Out of scope

- Any route, controller, socket handler, or change to `index.js`, `socket.js`, or the webhook. The Clerk `user.deleted` cascade into projects is S27.
- `canvasOps.js`, `workspaceRooms.js`, or any other later module.
- The `projectmessages` model (S23).
- Any client file.

## Dependencies

- None new. `mongoose` is already installed, and `node:test` is built into Node (24.x locally).

## Verify when done

- [ ] `cd server && npm test` passes: both test files run, every test passes, the process exits on its own without hanging, and the output has no Mongoose deprecation warnings.
- [ ] The `can` test has all 18 table cells.
- [ ] `projectAccess.js` has no import of anything except `mongoose` and `../models/project.model.js`, and neither model imports `projectAccess.js`.
- [ ] `roleOf` and `can` read no clock and do no I/O, and nothing in the module mutates its arguments.
- [ ] `node --check` on all three new source files.
- [ ] The two new models import and compile alongside the existing ones (`node -e "import('./src/models/project.model.js').then(()=>import('./src/models/canvas.model.js')).then(()=>console.log('ok'))"` from `server/`).
- [ ] `cd server && npm run dev` boots with `Server is up and running` and `MongoDB connected`. If `server/.env` is absent, record that as BLOCKED, as in S01. Don't create or edit any `.env` file.
- [ ] `git diff --stat` shows only: `server/package.json` (one script line), `server/readme.md`, the five new files, and `context/6-progress-tracker.md`.
- [ ] `npm run build` at the repo root passes, as a regression check. No client files change.
- [ ] `server/readme.md` updated as described.
- [ ] `context/6-progress-tracker.md`: S02 marked **Ready for review** with a slice note.
