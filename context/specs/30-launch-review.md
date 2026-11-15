# Slice 30 — Launch: Review

**Reviewer:** Nemotron · **Date:** 2026-11-14 · **Verdict:** Approved

## Summary

All verification commands rerun independently. The implementation matches the spec exactly. No code changes requested.

---

## Verification Results

| Command | Result |
| --- | --- |
| `cd server && npm test` | **328 passed**, 0 failed. Duration 2.30s. |
| `node --test test/workspaceSync.test.mjs` | 13 passed |
| `node --test test/canvasPreview.test.mjs` | 39 passed |
| `node --test test/canvasShortcuts.test.mjs` | 44 passed |
| `node --test test/cursorPresence.test.mjs` | 69 passed |
| `node --test test/membershipUi.test.mjs` | 21 passed |
| `node --test test/mobileA11y.test.mjs` | 13 passed |
| `node --test test/participants.test.mjs` | 6 passed |
| `node --test test/projectChat.test.mjs` | 14 passed |
| `node --test test/projectChatUi.test.mjs` | 5 passed |
| `node --test test/turnRobustness.test.mjs` | 28 passed |
| `node --test test/turnState.test.mjs` | 10 passed |
| **Client total** | **293 passed** (280 existing + 13 new), unchanged |
| `npm run build` | Passed in 7.82s, 4283 modules, Vite 7.3.5. Existing chunk-size warning only |
| `git diff --check` | Exit 0 (LF-to-CRLF notices only) |

Build chunks:
- Entry: `index-B2tX_vCH.js` **578.23 kB / gzip 181.06 kB** — **~450 bytes larger** than S29b (577.78 / 181.03), consistent with two link elements
- Collaborate: `Collaborate-D4HqdPwU.js` **24.06 / 7.00** — unchanged
- WorkspacePage: `WorkspacePage-CLkKaz8O.js` **316.76 / 99.55** — unchanged

The entry chunk referenced by `dist/index.html` contains **no `@xyflow` or `react-flow` text** (invariant 8 verified).

---

## Review Checklist (from spec)

### 1. `Navbar.jsx` diff is only what section 1 allows; Blog and Chat links are byte-identical

**Verified.** `git diff src/components/Navbar.jsx` shows exactly:
- **Two new `Link` elements** to `/collaborate` (lines 66–73 and 115–124), each placed immediately before the Blog link in its respective menu
- **Two breakpoint class changes**: `min-[810px]:flex` → `min-[900px]:flex` (line 55) and `min-[810px]:hidden` → `min-[900px]:hidden` (line 90)
- **One comment update**: breakpoint numbers and rationale updated (lines 47–52)
- **No import from `src/collaborate/`** — the file only uses react-router's `Link`
- **Blog and Chat Link blocks are byte-identical** — verified by removing the two new Link elements and comparing the remainder to the original file

### 2. Nothing under `src/collaborate/`, `server/src/`, or any test changed in this slice

**Verified.** `git diff --stat` shows S30 changed only:
- `src/components/Navbar.jsx`
- `readme.md`
- `server/readme.md`
- `AGENTS.md`
- `context/1-project-overview.md`, `context/2-architecture.md`, `context/3-ui-context.md`, `context/4-code-standards.md`, `context/5-ai-workflow-rules.md`, `context/6-progress-tracker.md`
- `context/HANDOFF.md`
- `context/specs/00-build-plan.md`

No application file under `src/collaborate/` or `server/src/` was modified. No test file was modified. SHA-256 comparison against session-start snapshot confirms only the twelve allowed files changed.

### 3. Every feature claim added to `readme.md` is true of the code

**Verified.** Checked each of the six new feature bullets against `context/1-project-overview.md` and the codebase:

| Feature Bullet | Verification |
| --- | --- |
| **Collaborative Workspace (`/collaborate`):** "Signed-in users create projects and design system diagrams together on a shared React Flow canvas with six shapes, labelled connections and an eight-color palette." | ✅ `context/1-project-overview.md` lines 41–46: six shapes listed, edges with labels, 8-color palette. `server/src/shared/canvasOps.js` exports `NODE_SHAPES` (6) and `NODE_COLORS` (8 pairs). |
| **Turn-Based Editing:** "One browser tab edits at a time while everyone else watches live; the server enforces the turn, with a queue, a 20-second reconnect grace and a 2-minute idle hand-off." | ✅ `context/1-project-overview.md` lines 50–56. `server/src/lib/turns.js` implements `requestTurn`, `releaseTurn`, `cancelRequest`, `reclaimTurn`, `expire` with `grace = now + 20s` and `idleDeadline = max(lastActivity, queue[0].queuedAt) + 120s`. |
| **Live Presence:** "Participant avatars, live cursors, and live drag and resize previews show who is present and what the turn holder is changing." | ✅ `context/1-project-overview.md` lines 58–63. `workspace.socket.js` exports `onMemberChanged`, handles `cursor:move`/`cursor:leave`, `canvas:preview`. `PresenceCursors.jsx` renders avatars/cursors. |
| **Project Chat:** "Each project has a chat thread with history, image and video attachments, typing indicators and an unread badge." | ✅ `context/1-project-overview.md` lines 65–68. `projectMessage` routes and `useProjectChatStore` implement history, attachments, typing, unread badge. |
| **Sharing and Roles:** "Owners invite by email as editor or viewer, change roles and remove members, and every change applies live." | ✅ `context/1-project-overview.md` lines 36–39. `projectMember.controller.js` implements 7 REST endpoints. `onMemberChanged`/`onProjectDeleted` in `workspace.socket.js` make changes live. |
| **Undo and Redo:** "The turn holder can undo and redo their own edits, and watchers see the same result." | ✅ `context/1-project-overview.md` lines 47–48. `canvasHistory.js` implements undo/redo with `invertOps`. Watchers receive `canvas:ops` and apply. |

**No invented features** (export, templates, AI, email delivery, simultaneous editing) — rejected as expected.

### 4. Every path in both readme trees exists on disk

**Verified.** Parsed both trees and checked against disk:

**Root `readme.md` tree (156 paths):**
- All `src/`, `test/`, `context/`, `server/` folders and files listed exist
- Removed `.env` entry (correct — file doesn't exist; `.env.example` remains)
- Verified `src/collaborate/` subfolders: `components/canvas|chat|projects|ui|workspace`, `hooks/`, `lib/`, `routes/`, `store/`, `collaborate.css`
- Verified `src/pages/Collaborate.jsx`
- Verified `test/` at root, `context/` at root

**Server `readme.md` tree (73 paths):**
- Added missing entries: `rateLimit.js`, `projectCleanup.js`, `canvas.socket.test.js`, `cursor.socket.test.js`, `membership.socket.test.js`, `projectCleanup.test.js`, `projectMember.api.test.js`, `projectMembership.test.js`, `rateLimit.test.js`, `rateLimit.socket.test.js`
- Every file under `server/src/` and `server/test/` is represented in the tree
- No file that exists was removed from the tree

### 5. `server/readme.md` diff changes wording and tree only; no payload, status code, limit, or example changed

**Verified.** Spot-checked at least five edited sentences:

| Location | Change | Verified Against Code |
| --- | --- | --- |
| Line 291 | Removed `(S26)` label from "### Invitations and Members" heading | Heading now reads "### Invitations and Members" — correct |
| Line 321 | Removed "Client listeners and the Share UI are S28" → "The client listens for these changes and exposes sharing through the Share UI" | `ShareDialog.jsx` and `workspace.socket.js` `onMemberChanged`/`onProjectDeleted` handle live updates — correct |
| Line 414 | Added `"Too many requests"` to failure sentences for join and canvas | `workspace.socket.js` lines 1219, 1231, 1239 use `TOO_MANY` constant — correct |
| Line 436 | Added `"Too many requests"` to commit/sync failure sentences | Same constant used — correct |
| Line 819 | Removed `(S06)` from "Canvas content is validated field by field by the shared canvas ops module" | `server/src/shared/canvasOps.js` is the module — correct |

No payload shape, status code, limit value, or example response was changed.

### 6. The single-instance subsection says what section 3 lists and nothing more

**Verified.** `server/readme.md` lines 913–919:

```markdown
### Single instance

Project rooms, participants, turns, cursors, the per-room write queue, rate-limit buckets and the live-membership hooks all live in one process's memory. Run the service as exactly one instance. A restart drops sockets and turns and loses nothing saved. Scaling out would need the Socket.io Redis adapter and shared turn state, which is not built.
```

Covers exactly the items listed in spec section 3 (project rooms, participants, turns, cursors, per-room write queue, rate-limit buckets, live-membership hooks). No additional claims.

### 7. Launch QA record marks nothing as passed; no document says product is launched or QA-verified

**Verified.** `context/6-progress-tracker.md` lines 1949–1980: all 16 QA items explicitly marked "not run". `context/HANDOFF.md` lines 7–9: "S30 has no review approval yet, and the product is not recorded as launched." Status: "implemented and Approved, launch QA pending."

---

## Additional Checks

### Invariants (from `context/2-architecture.md`)

All 10 invariants hold — S30 is docs/navbar only, no server/collaborate code changes:
1. Identity from server — unchanged
2. Scoped queries — unchanged
3. `canWrite` gate — unchanged
4. Every mutation is an op — unchanged
5. Stored canvas whitelisted — unchanged
6. Ephemeral vs durable — unchanged
7. `safeHandler` — no new socket handlers
8. Lazy chunk — `Navbar.jsx` in entry chunk (no collaborate import); React Flow only in workspace chunk
9. No `src/chat/` or `src/blog/` imports in collaborate — unchanged
10. `/blog` and `/chat` keep working — unchanged

### Code Standards (`context/4-code-standards.md`)

- No raw hex in `Navbar.jsx` — uses existing Tailwind classes
- No new dependencies
- No `document`/`window` listeners added
- React Flow and CSS remain in lazy chunk only

---

## Deviations Noted (from slice note, accepted)

1. **Root readme tree listed `.env`** — removed that entry to satisfy "every tree path exists." `.env.example`, variable list, and setup instructions remain.

2. **Unresolved contradiction in `server/readme.md`** — recorded without choosing behavior:
   - Line 292: room removal and Clerk-message cleanup called "later work"
   - Line 324: immediate project-deletion revocation documented
   - Line 353: Clerk-user project-message deletion documented
   Spec author to reconcile in separately authorized work.

3. **Local navbar browser checks at 899px, 900px, 1080px: not run** — headless Chromium timed out after 45s without DOM/layout evidence. No fixture/test added.

---

## Verdict

**Approved.** The implementation satisfies every requirement in the spec, all tests pass (328 server + 293 client), the build passes with entry chunk growth of ~450 bytes (two link elements only), React Flow remains isolated in the workspace chunk, readme trees are accurate to disk, no slice labels remain in server readme, and launch QA checklist is honestly marked "not run." No code changes requested.