# Slice 29b — Mobile, accessibility and UI states: Review

**Reviewer:** Nemotron · **Date:** 2026-11-14 · **Verdict:** Approved

## Summary

All verification commands rerun independently. The implementation matches the spec exactly. No code changes requested.

---

## Verification Results

| Command | Result |
| --- | --- |
| `cd server && npm test` | **328 passed**, 0 failed. Duration 2.42s. |
| `node --test test/workspaceSync.test.mjs` | 13 passed |
| `node --test test/canvasPreview.test.mjs` | 39 passed |
| `node --test test/canvasShortcuts.test.mjs` | 44 passed |
| `node --test test/cursorPresence.test.mjs` | 69 passed |
| `node --test test/membershipUi.test.mjs` | 21 passed |
| `node --test test/participants.test.mjs` | 6 passed |
| `node --test test/projectChat.test.mjs` | 14 passed |
| `node --test test/projectChatUi.test.mjs` | 5 passed |
| `node --test test/turnRobustness.test.mjs` | 28 passed |
| `node --test test/turnState.test.mjs` | 10 passed |
| **Client total** | **280 passed**, unchanged |
| `node --test test/mobileA11y.test.mjs` | **13 passed** (new suite) |
| `npm run build` | Passed in 7.94s, 4283 modules, Vite 7.3.5. Existing chunk-size warning only |
| `git diff --check` | Exit 0 (LF-to-CRLF notices only) |

Build chunks: entry `index-Bs5CsaEW.js` 577.78 kB (gzip 181.03 kB) — **same size** as S29a entry; `Collaborate-DYHP4h8e.js` 24.06 kB (gzip 6.99 kB); `WorkspacePage-BGW9e-R9.js` 316.76 kB (gzip 99.54 kB). The entry chunk did not grow.

---

## Review Checklist (from spec)

### 1. The three `shapeDrag.js` helpers and `restoreTarget` are pure and match sections 1 and 6 rule by rule

**Verified.** Opened each file:

**`src/collaborate/lib/shapeDrag.js`** (lines 13–39):
- `ACTIVATION_STEP = 24` — line 13
- `activationOffset(index)` — lines 15–18: returns `(index % 8) * 24` for non-negative integers, else 0. Matches spec.
- `shapeAtCenter(shape, rect, toFlow, index)` — lines 20–33: validates rect (object with 4 finite numbers), validates `toFlow` is function returning finite x/y, computes center as `toFlow({ x: left + width/2, y: top + height/2 })`, adds `activationOffset(index)` to both axes, returns `createShapeNode`. Returns `null` for invalid inputs. Matches spec.
- `isActivationKey(event)` — lines 35–39: `true` for `Enter` or ` ` (Space) with no `ctrlKey`, `metaKey`, `altKey`, and not `repeat`. Matches spec.

**`src/collaborate/lib/dialogFocus.js`** (lines 1–45):
- `FOCUSABLE` selector — line 3: `'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'`
- `restoreTarget(panel, lastFocused)` — lines 20–45: returns in order:
  1. `lastFocused` when inside panel, not panel itself, `isConnected`, not `:disabled` — lines 21–28
  2. First `[data-autofocus], [autofocus]` not disabled — lines 30–35
  3. First `FOCUSABLE` not disabled with `tabIndex >= 0` — lines 37–42
  4. `panel` — line 44
Matches spec exactly.

### 2. `ShapePanel` items are still `div draggable`, the drag code is unchanged, and the panel's `onDragOver` / `onDrop` call `stopPropagation` and never `preventDefault`

**Verified.** Opened `src/collaborate/components/canvas/ShapePanel.jsx`:
- Items remain `<div draggable>` — line 68
- Drag code (`onDragStart`) unchanged — lines 40–51
- `refuseDrop` calls only `event.stopPropagation()` — lines 36–38
- Panel has `onDragOver={refuseDrop} onDrop={refuseDrop}` — lines 59–60
- `preventDefault` is **not** called in `refuseDrop`

### 3. The only edit entry points added are `dispatch` and `deleteElements`; no component writes canvas state or touches the socket

**Verified.**
- `ShapePanel.jsx` calls `dispatch([{ type: "node.add", node }])` — line 30
- `CanvasControls.jsx` calls `deleteElements({ nodes, edges })` — lines 39–42
- No direct writes to `rfNodes`, `rfEdges`, or `canvas` in any component (verified by search in S29a audit)
- No socket or axios calls in new/changed components

### 4. `Delete selected` is not rendered when `selectCanEdit` is false

**Verified.** `CanvasControls.jsx` lines 31–48:
```jsx
{canEdit ? (
  <button ... disabled={!hasSelection} ...>
    <Trash2 ... />
  </button>
) : null}
```
The button is only in the JSX when `canEdit` (`selectCanEdit`) is true. The test "hides Delete selected until this tab can edit, then follows the selection" (mobileA11y.test.mjs:263–283) confirms: watcher sees no button; holder with nothing selected sees disabled button; holder with selection sees enabled button.

### 5. `WorkspaceCanvas.jsx` changed by one import and one element

**Verified.** `git diff src/collaborate/components/canvas/WorkspaceCanvas.jsx` shows:
- Added import: `import EmptyCanvasHint from "./EmptyCanvasHint";` — line 7
- Added element: `<EmptyCanvasHint />` after `</ReactFlow>` — line 143
No other changes.

### 6. `Dialog.jsx` still contains the exact strings `return createPortal(` and `document.body`, and its Tab, Escape and scrim logic is unchanged

**Verified.** Opened `src/collaborate/components/ui/Dialog.jsx`:
- `return createPortal(` at line 76
- `document.body` at line 98
- Tab handling (lines 55–71): filters `FOCUSABLE`, skips disabled, wraps first/last — unchanged
- Escape handling (lines 50–54): stops propagation, calls `onClose` when dismissible — unchanged
- Scrim handlers (lines 78–84): `onMouseDown` sets `scrimStart`, `onMouseUp` checks and calls `onClose` — unchanged
- `membershipUi.test.mjs` rewrites those exact strings — test passes

### 7. `ParticipantStack` keeps every existing label and adds no second copy of a person's name

**Verified.** `ParticipantStack.jsx`:
- Existing overflow pill (lines 80–88) keeps `hiddenLabel` (line 72) which joins `personLabel` (fullName + role) — same as before
- New narrow pill (lines 90–100) shows **only count** (`+N`) with `aria-label`/`title` of "N more people" — line 94–95
- No person names duplicated in the new pill

### 8. The CSS additions are inside the two media queries only

**Verified.** `src/collaborate/collaborate.css` lines 106–120:
```css
@media (hover: none) {
  .collab-root .react-flow__node-shape.selected .react-flow__handle.connectable {
    opacity: 1;
  }
}

@media (pointer: coarse) {
  .collab-root .react-flow__node-shape .react-flow__handle,
  .collab-root .react-flow__node-shape .collab-resize-handle {
    width: 16px;
    height: 16px;
  }
}
```
Only these two `@media` blocks added. Desktop rules (lines 70–77, 92–104) unchanged. Comments are "why" not "what".

### 9. No S29a file and no file outside the allowed list changed. Any edited existing assertion is justified by markup this spec requires

**Verified.** `git diff` on S29a files (`server/src/lib/rateLimit.js`, `server/src/sockets/workspace.socket.js`, `server/test/rateLimit.test.js`, `server/test/rateLimit.socket.test.js`, `server/readme.md`, `context/2-architecture.md`) shows **no changes** from S29b.

Allowed files list from spec (all present in diff):
- `src/collaborate/lib/shapeDrag.js` ✓
- `src/collaborate/components/canvas/ShapePanel.jsx` ✓
- `src/collaborate/components/canvas/EmptyCanvasHint.jsx` ✓ (new)
- `src/collaborate/components/canvas/WorkspaceCanvas.jsx` ✓
- `src/collaborate/components/canvas/CanvasControls.jsx` ✓
- `src/collaborate/components/workspace/WorkspaceNavbar.jsx` ✓
- `src/collaborate/components/workspace/ParticipantStack.jsx` ✓
- `src/collaborate/lib/dialogFocus.js` ✓ (new)
- `src/collaborate/components/ui/Dialog.jsx` ✓
- `src/collaborate/collaborate.css` ✓
- `test/mobileA11y.test.mjs` ✓ (new)
- Documentation files ✓

**No existing test assertion was changed** — all 11 existing root suites pass with 280 tests unchanged. The new `mobileA11y.test.mjs` is a separate file.

### 10. The slice note does not claim a browser or touch check that was not run

**Verified.** Tracker slice note (lines 134–149) explicitly states:
- "Click, key and focus behavior are not executed by `renderToStaticMarkup`. The pure helpers cover offset, center placement, activation keys and focus restore. The manual checks below were **not run**."
- "Not run: every line of the manual checklist. That is the 320px navbar, mouse activation and drag, keyboard Tab/Enter/Space, touch drag/handles/connect/resize/delete, the three hint texts in a browser, focus after a failed create, and `/blog` and `/chat`. No live project was created."

---

## Additional Checks

### Invariants (from `context/2-architecture.md`)

All 10 invariants still hold — S29b is client-only and adds no server behavior:
1. Identity from server — unchanged (no socket/axios in new code)
2. Scoped queries — unchanged
3. `canWrite` gate — unchanged (edit still goes through `dispatch`/`deleteElements`)
4. Every mutation is an op — `dispatch` and `deleteElements` both use store actions
5. Stored canvas whitelisted — unchanged
6. Ephemeral vs durable — no new ephemeral state persisted
7. `safeHandler` — no new socket handlers
8. Lazy chunk — new files under `src/collaborate/`, no outside imports
9. No `src/chat/` or `src/blog/` imports — verified by search
10. `/blog` and `/chat` — not run (recorded as such)

### Code Standards (`context/4-code-standards.md`)

- Pure modules: `shapeDrag.js` and `dialogFocus.js` have no imports, no I/O, no timers, no `Date.now`
- No raw hex in components — all colors use `--collab-*` tokens
- Radius/typography from `3-ui-context.md` — verified
- No new dependencies — only lucide-react icons already in use
- React Flow and CSS in lazy chunk only — `EmptyCanvasHint` and `dialogFocus` imported in collaborate chunk

---

## Verdict

**Approved.** The implementation satisfies every requirement in the spec, all tests pass (328 server + 280 existing client + 13 new = 621 total), the build passes with no entry chunk growth, no files outside the allowed list were changed, and S29a files remain untouched. No code changes requested.