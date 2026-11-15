# Slice 29b — Mobile, accessibility and UI states

**Execution status (2026-11-14): Todo.** Spec written; implementation not started.

**Lane** client · **Depends on** S28 (Committed, `efb06d9`) · **Unblocks** S30

**Spec author** Claude Fable 5.2 · **Implementer** Grok · **Reviewer** Nemotron (same assignment as S29a; the user confirms)

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, and this spec. Planning HEAD is `efb06d9` (commit 70). S29a is Approved and uncommitted in the working tree: **do not touch any S29a file** (`server/**`, the two `rateLimit` tests, the S29a spec and review). Recheck `git status` and `git log -3` before starting.

Baseline from the S29a review: server suite **328**, eleven root client suites **280**, production build passing.

This is the client half of the build plan's S29. Earlier slices already built the not-found card, the error card with Try again, the `Waking the server…` banner, the chat panel stacking under the canvas below `lg`, and the dialog focus trap. This slice adds what is still missing:

1. A way to add a shape without a mouse drag (click, tap, Enter or Space).
2. An empty canvas hint.
3. A Delete button, because a touch screen has no Delete key.
4. Touch-sized connection and resize handles.
5. A workspace navbar that fits a 320px screen.
6. Focus that returns to where it was after a failed dialog submit.
7. A label sweep over icon-only controls.

**No server change.** No new socket event, REST call, store action, dependency or token. Every canvas change still goes through the existing store actions `dispatch` and `deleteElements`. No change to `/blog`, `/chat`, the portfolio or the dashboard layout.

Mark S29b In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy. Do not start S30.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/lib/shapeDrag.js` | Add `activationOffset`, `shapeAtCenter`, `isActivationKey` |
| `src/collaborate/components/canvas/ShapePanel.jsx` | Activation, focus, drop refusal, horizontal scroll |
| `src/collaborate/components/canvas/EmptyCanvasHint.jsx` | **New.** |
| `src/collaborate/components/canvas/WorkspaceCanvas.jsx` | Render the hint. Nothing else |
| `src/collaborate/components/canvas/CanvasControls.jsx` | Delete selected button |
| `src/collaborate/components/workspace/WorkspaceNavbar.jsx` | Narrow-screen classes and one label |
| `src/collaborate/components/workspace/ParticipantStack.jsx` | Narrow-screen stack |
| `src/collaborate/lib/dialogFocus.js` | **New.** Pure `restoreTarget` |
| `src/collaborate/components/ui/Dialog.jsx` | Use `restoreTarget` when a locked dialog unlocks |
| `src/collaborate/collaborate.css` | Touch handle rules |
| `test/mobileA11y.test.mjs` | **New.** |
| `context/3-ui-context.md`, `context/2-architecture.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md` | Documentation |

Everything else stays unchanged. If the work seems to need another file, stop and record an open question in the tracker.

**Existing tests.** `participants.test.mjs`, `projectChatUi.test.mjs`, `membershipUi.test.mjs` and `canvasShortcuts.test.mjs` render the navbar, the participant stack, the dialog and the canvas controls. The markup below was chosen so they should pass untouched. If one fails only because of markup this spec requires, you may change that single assertion, and you must list the file, the line and the reason in the slice note. Any other failure: stop and record it.

## 1. Add a shape by activating it

### `lib/shapeDrag.js`

Three pure exports, added beside the existing two. No DOM access, no store access.

```js
export const ACTIVATION_STEP = 24;

export function activationOffset(index)
// A non-negative integer gives (index % 8) * ACTIVATION_STEP. Anything else gives 0.

export function shapeAtCenter(shape, rect, toFlow, index)
// rect: { left, top, width, height } in client pixels.
// toFlow: ({ x, y }) => ({ x, y }), React Flow's screenToFlowPosition.
// Returns createShapeNode(shape, center) or null.

export function isActivationKey(event)
// true for key "Enter" or " " with no ctrl, meta, alt, and not a repeat.
```

`shapeAtCenter`: if `rect` is not an object with four finite numbers, or `toFlow` does not return finite `x` and `y`, return `null`. The center is `toFlow({ x: left + width / 2, y: top + height / 2 })`, then `activationOffset(index)` is added to both `x` and `y`. The offset keeps repeated activations from stacking nodes exactly on top of each other; after eight it wraps.

### `ShapePanel.jsx`

Each shape item stays a `div` with `draggable` (Firefox does not start a drag on a button) and keeps its existing drag behavior. Add to each item:

- `role="button"`, `tabIndex={0}`, `aria-label={`Add ${title.toLowerCase()}`}`. Remove the `sr-only` span, which the label replaces, and mark the icon `aria-hidden="true"`.
- `title={`Click or drag to add a ${title.toLowerCase()}`}`.
- A visible focus style: the same `focus-visible:outline ... outline-[var(--collab-accent)]` classes `CanvasControls` uses.
- `onClick`: add the shape.
- `onKeyDown`: when `isActivationKey(event)`, call `preventDefault()` and add the shape.

Adding the shape: find the canvas element with `event.currentTarget.closest(".react-flow")`, read its `getBoundingClientRect()`, call `shapeAtCenter(shape, rect, screenToFlowPosition, count)` where `count` is a `useRef(0)` counter that increases by one on every activation, and when a node comes back call the store's `dispatch([{ type: "node.add", node }])`. Read `dispatch` from `useWorkspaceStore`, as `WorkspaceCanvas` already does. The store's own gate still decides whether the edit is allowed.

On the panel container:

- Add the class `nokey`, so React Flow ignores keys typed while a shape item has focus (the same class `ColorToolbar` uses).
- Add `max-w-[calc(100%-2rem)] overflow-x-auto`, and `shrink-0` on each item, so the row scrolls sideways if it ever cannot fit.
- Add `onDragOver` and `onDrop` handlers that call only `event.stopPropagation()`. They must **not** call `preventDefault()`. This makes the panel refuse a shape dropped on itself, which today adds a node hidden under the panel (S08 review nit).

A drag still works exactly as before; a completed drag does not fire `click`.

## 2. Empty canvas hint

New `components/canvas/EmptyCanvasHint.jsx`, default export. It reads from `useWorkspaceStore`: `status`, `canvas.nodes.length`, `role`, and `selectCanEdit`.

It renders `null` unless `status === "ready"` and the canvas has zero nodes. Otherwise it renders one paragraph:

| State | Text |
| --- | --- |
| `selectCanEdit` is true | `Click a shape below to add it, or drag one onto the canvas.` |
| `role === "viewer"` | `This canvas is empty.` |
| anything else | `This canvas is empty. Request the turn to start drawing.` |

Markup: a wrapper `div` with `pointer-events-none absolute inset-0 flex items-center justify-center p-6`, and inside it `<p className="max-w-xs text-center text-sm text-[var(--collab-muted)]">`. No `aria-live` and no `role`: the turn bar already announces state, and this text must not be read out every time the canvas empties.

In `WorkspaceCanvas.jsx`, render `<EmptyCanvasHint />` as the last child of the wrapper `div`, after `</ReactFlow>`. That is the only change to this file. Because the hint ignores the pointer, clicks, drags and drops still reach the canvas.

## 3. Delete selected

In `CanvasControls.jsx`, add one button directly after Redo and before the divider, rendered **only when `selectCanEdit` is true**, so the markup for viewers and watchers does not change.

- Icon `Trash2` (`h-5 w-5`, `aria-hidden="true"`), `aria-label="Delete selected"`, `title="Delete selected (Delete)"`, the existing `buttonClass`.
- `disabled` when nothing is selected. Read that as one boolean selector: `s.rfNodes.some((n) => n.selected) || s.rfEdges.some((e) => e.selected)`.
- `onClick`: read the current state with `useWorkspaceStore.getState()` and call its `deleteElements({ nodes, edges })` with the selected display nodes and edges. `deleteElements` already validates ids, drops edges that a removed node cascades, and dispatches one batch.

The keyboard Delete and Backspace path is not changed.

## 4. Touch handles (`collaborate.css`)

Connection handles are 8px and appear only on hover, and resize handles are 8px. A touch screen has no hover and a finger cannot hit 8px. Add, after the existing handle and resize rules, scoped the same way:

```css
/* A touch screen never hovers, so a selected node shows its handles instead. */
@media (hover: none) {
  .collab-root .react-flow__node-shape.selected .react-flow__handle.connectable {
    opacity: 1;
  }
}

/* A finger needs a larger target than a mouse pointer does. */
@media (pointer: coarse) {
  .collab-root .react-flow__node-shape .react-flow__handle,
  .collab-root .react-flow__node-shape .collab-resize-handle {
    width: 16px;
    height: 16px;
  }
}
```

Keep the comments in the repo's voice (why, not what). Do not change the desktop rules. React Flow's click-to-connect (tap one handle, then another) is on by default and is not changed.

## 5. Navbar at 320px

At 320px the navbar's fixed-width items (the Projects link text, up to five avatars, the role badge, Share and Chat) push the Chat button out of the clipped header. Below `sm`:

**`WorkspaceNavbar.jsx`**

- Back link: add `aria-label="Back to projects"`, mark `ArrowLeft` `aria-hidden="true"`, and wrap the word in `<span className="hidden sm:inline">Projects</span>`.
- Role badge: wrap `<RoleBadge role={role} />` in `<span className="hidden shrink-0 sm:inline-flex">`. The turn bar already tells a viewer they are view only.
- Chat button: change the text span to `className="hidden truncate sm:inline"`. Its `aria-label` already names it.

Do not change the Share button, the chat ids, `aria-expanded`, `aria-controls` or the unread badge.

**`ParticipantStack.jsx`**

Add `const SMALL_VISIBLE = 2;`. Keep the DOM order and every existing element, label and title.

- Avatars at index `SMALL_VISIBLE` and above get `hidden sm:flex` in place of `flex`. Pass a prop to `ParticipantAvatar` for this.
- The existing overflow pill gets `hidden sm:inline-flex` in place of `inline-flex`.
- Add one new pill **after** the existing one, rendered only when `others.length > SMALL_VISIBLE`: class `sm:hidden` plus the existing pill classes, text `+{others.length - SMALL_VISIBLE}`, `role="img"`, `tabIndex={0}`, and `aria-label` / `title` of `{n} more people` (`1 more person` for one). It carries a count only, not names, so no label text is duplicated in the markup.

## 6. Dialog focus after a failed submit

Today, when a dialog locks during a submit, focus moves to the panel, and if the submit fails it stays there. A keyboard user has to tab back in (S05 review nit).

**New `lib/dialogFocus.js`**, pure, one export:

```js
export function restoreTarget(panel, lastFocused)
```

It returns the element to focus, in this order:

1. `lastFocused`, when it is inside `panel` (`panel.contains`), is not `panel` itself, `isConnected` is true, and it does not match `:disabled`.
2. The first element matching `[data-autofocus], [autofocus]` inside `panel` that does not match `:disabled`.
3. The first element matching the dialog's focusable selector that does not match `:disabled` and has `tabIndex >= 0`.
4. `panel`.

Export the focusable selector string from this file and import it in `Dialog.jsx`, so there is one copy.

**`Dialog.jsx`**

- Keep a `lastFocused` ref. In the existing `focusin` listener, when the target is inside the panel and is not the panel, store it.
- In the existing `dismissible` effect, keep the current behavior when `dismissible` is false (focus the panel). When `dismissible` changes from false to true, focus `restoreTarget(panel.current, lastFocused.current)`. Track the previous value with a ref. Do nothing on the first run.
- Do not change the open/close effect, the Tab handling, Escape, the scrim handlers, or the `createPortal(` call and its `document.body` argument. `membershipUi.test.mjs` rewrites those two exact strings.

This also improves `ShareDialog`: after an invite, role change or removal finishes, focus returns to the control the owner used when it still exists and is enabled, and otherwise to the email field.

## 7. Label sweep

Open every component under `src/collaborate/components/` and `src/collaborate/routes/`. For each `button`, link and `role="button"` whose content is only an icon or only a color, confirm it has an `aria-label` (or an `sr-only` label). The spec author's pass found every existing one labelled once sections 1, 3 and 5 are done. Record the list you checked in the slice note as `path:line`. If you find one missing in a file that is not in the allowed list, do not edit it: record it.

## 8. Things that stay true

- Components never call `socket` or `axios`, and never write `rfNodes`, `rfEdges` or `canvas`. The two new edit entry points call `dispatch` and `deleteElements`.
- `selectCanEdit` remains the only edit gate. The shape panel is still rendered only for the holder.
- Nothing new is imported from `src/chat/` or `src/blog/`, and nothing outside `src/collaborate/` imports the new files.
- No raw hex and no Tailwind palette colors in components.
- Keyboard shortcuts stay attached to the canvas surface through `useCanvasShortcuts`. No listener is added to `document` or `window`.

## 9. Tests

New `test/mobileA11y.test.mjs`, built like `membershipUi.test.mjs`: a Vite server in middleware mode with `hmr: false` and its **own port (24929)**, `ssrLoadModule`, and `renderToStaticMarkup` from `test/ssrRender.js`. Copy helpers into the file; do not import from another test file. At least:

**`shapeDrag.js`**

1. `activationOffset`: 0 → 0, 1 → 24, 7 → 168, 8 → 0, 9 → 24; `-1`, `1.5`, `NaN`, `"2"` and `undefined` → 0.
2. `shapeAtCenter` with an identity `toFlow` and rect `{ left: 100, top: 50, width: 400, height: 200 }`: a rectangle's center is at (300, 150), so its `position` is the center minus half its default size. With `index` 2 it is 48 further on both axes.
3. `shapeAtCenter` returns `null` for an unknown shape, a missing rect, a rect with a `NaN`, and a `toFlow` that returns a non-finite point.
4. `isActivationKey`: true for Enter and Space; false with ctrl, meta or alt held, for a repeat, and for any other key.

**`dialogFocus.js`** (fake elements: plain objects with `contains`, `matches`, `querySelector`, `querySelectorAll`, `isConnected`, `tabIndex`)

5. Returns `lastFocused` when it is inside, connected and enabled.
6. Skips a `lastFocused` that is disabled, disconnected, outside the panel, or the panel itself, and returns the autofocus element.
7. Falls back to the first enabled focusable, then to the panel.

**Markup**

8. `EmptyCanvasHint`: each of the three texts in its state; `""` when the canvas has a node; `""` when status is not `ready`. No `aria-live` in the output.
9. `ShapePanel` inside a `ReactFlowProvider`: six items, each with `role="button"`, `tabindex="0"`, `draggable="true"` and labels `Add rectangle`, `Add diamond`, `Add circle`, `Add pill`, `Add cylinder`, `Add hexagon` in the shared module's order; the toolbar has the `nokey` class.
10. `CanvasControls`: no `Delete selected` for a watcher; present and `disabled` for the holder with nothing selected; present and enabled with a selected node in `rfNodes`. Reach the holder state the way `canvasShortcuts.test.mjs` does.
11. `WorkspaceNavbar`: the back link has `aria-label="Back to projects"`; the word `Projects` and the word `Chat` sit in spans with `hidden` and `sm:inline`; the role badge sits in a `hidden` wrapper.
12. `ParticipantStack` with seven others: the first two avatars have no `hidden` class; avatars three to five have `hidden sm:flex`; the existing `+2` pill has `hidden sm:inline-flex`; one new `sm:hidden` pill reads `+5` with the label `5 more people`. With exactly three others the new pill reads `+1` and `1 more person`. With two others there is no new pill.

Click, key and focus behavior run in React effects and handlers, which static markup does not execute. Those are covered by the pure helpers above and by the manual checklist below. Say so in the slice note; do not claim them as automated.

Every existing suite must still pass: 328 server and 280 client before, the same plus the new suite after.

## 10. Documentation

- `context/3-ui-context.md`: add a short `### S29b` section: shapes are added by click, tap, Enter or Space at the center of the visible canvas as well as by drag; the empty hint and its three texts; the Delete selected button; the touch handle rules; what the navbar hides below `sm`. Update the Workspace navbar line in Layout Patterns to match.
- `context/2-architecture.md`: add `EmptyCanvasHint` to the canvas components line and `dialogFocus.js` to the lib line; update the checkpoint line.
- Tracker: S29b row, slice note (what changed, verification with counts, deviations, the label sweep list, what was not run).
- HANDOFF: current point.

## Verify when done

- [ ] `node --test test/mobileA11y.test.mjs` passes. Report the count.
- [ ] Each of the eleven existing root suites passes in its own command. Report each count (baseline 280 in total). Any changed assertion is listed with its reason.
- [ ] `cd server && npm test` still passes 328.
- [ ] `npm run build` passes at the repo root with no new warnings. Report the entry, `Collaborate` and `WorkspacePage` chunk sizes; the entry chunk must not grow.
- [ ] `git diff --check` passes.
- [ ] `git diff --stat` shows only this spec's allowed files on top of the S29a files that were already changed.
- [ ] No `document.addEventListener` or `window.addEventListener` was added outside `Dialog.jsx`'s existing listener.
- [ ] No raw hex in the changed components.

**Manual checklist.** Run what you can in a real browser and record each line as passed or **not run**. Never record an unrun check as passed. Do not create live projects to satisfy it.

- [ ] At 320px wide: the navbar shows back, name, people count, Share and Chat with nothing clipped; the turn bar, shape panel and controls do not overlap each other.
- [ ] As the holder with a mouse: clicking a shape adds it at the center; clicking again adds one offset from the first; dragging still drops under the cursor; dropping on the panel adds nothing.
- [ ] As the holder with the keyboard: Tab reaches each shape, Enter and Space add it, and the page does not scroll on Space.
- [ ] On a touch device: tapping a shape adds it; a node drags; a selected node shows its four handles; tapping one handle and then another connects them; a corner resizes; Delete selected removes the selection.
- [ ] The empty hint shows the right text for the holder, a waiting editor and a viewer, and disappears when the first node arrives.
- [ ] In New project, a failed create (for example at the 20-project cap) leaves focus in the name field.
- [ ] `/blog` and `/chat` still load.

## Review checklist (for the reviewer)

Rerun every command above yourself. Then check:

1. The three `shapeDrag.js` helpers and `restoreTarget` are pure and match sections 1 and 6 rule by rule.
2. `ShapePanel` items are still `div draggable`, the drag code is unchanged, and the panel's `onDragOver` / `onDrop` call `stopPropagation` and never `preventDefault`.
3. The only edit entry points added are `dispatch` and `deleteElements`; no component writes canvas state or touches the socket.
4. `Delete selected` is not rendered when `selectCanEdit` is false.
5. `WorkspaceCanvas.jsx` changed by one import and one element.
6. `Dialog.jsx` still contains the exact strings `return createPortal(` and `document.body`, and its Tab, Escape and scrim logic is unchanged.
7. `ParticipantStack` keeps every existing label and adds no second copy of a person's name.
8. The CSS additions are inside the two media queries only.
9. No S29a file and no file outside the allowed list changed. Any edited existing assertion is justified by markup this spec requires.
10. The slice note does not claim a browser or touch check that was not run.
