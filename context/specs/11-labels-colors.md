# Slice 11: Labels and colors

**Lane:** client · **Depends on:** S10 (Approved) · **Unblocks:** S12

**Implementer:** Grok · **Reviewer:** Codex (assigned by the user)

## Goal

Owners and editors can double-click a shape to edit its label and use eight palette swatches above a selected node to change its fill and text color together. Typing changes only a local draft. A completed label edit or changed palette choice dispatches one `node.update`; cancelling or choosing an unchanged value dispatches nothing.

Read `AGENTS.md`, all six context files, and this spec. For this slice, the user assigned Codex the spec/review roles described as Claude's roles in the older workflow text. S10 is Approved but still uncommitted when this spec is written. Its approved working-tree changes are the implementation baseline: preserve them and report S11 changes relative to that baseline, not just to HEAD. The user handles commits.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/store/useWorkspaceStore.js` | Add two node data actions; preserve the S10 geometry and deletion pipeline |
| `src/collaborate/components/canvas/ShapeNode.jsx` | Start/close label sessions, compose editor and toolbar, suppress edit gestures from reaching canvas handlers |
| `src/collaborate/components/canvas/NodeLabelEditor.jsx` | New: local textarea draft and terminal edit events |
| `src/collaborate/components/canvas/ColorToolbar.jsx` | New: React Flow NodeToolbar with the shared eight-color palette |
| `src/collaborate/collaborate.css` | Only additional scoped editor/toolbar rules if utilities do not suffice; no token changes |
| `context/6-progress-tracker.md` | Status, changed files, verification evidence, and deviations |

No other production files, dependencies, persistent test framework, server changes, transport changes, or edits to the supplied spec. In particular, `WorkspaceCanvas.jsx` and its S10 callbacks stay unchanged. The small UI-context clarification accompanying this spec is authoring work, not an additional implementation task. No commits, pushes, branches, or S12 work.

## Existing behavior to preserve

- Six CSS/SVG shapes, shape-specific label insets, wrapped/clipped labels, selected borders, and all four connection handles.
- S10's selected/editable resizer, shared 40–2000 limits, fractional positions, one batch per drag/delete gesture, cascade filtering, display restoration on rejection, and final resize notification handling.
- Canonical state changes only through `dispatch(ops)` and shared `applyOps`. Canonical version remains unchanged in this local-only phase. No canvas persistence or realtime behavior arrives here.
- `selectCanEdit` remains the permission source: owner/editor now, turn holder in a later slice. Never duplicate role comparisons in components.

## Store actions

Add actions alongside the existing gesture actions. Both read **current** state, recheck `selectCanEdit`, look up the canonical node by id, and return a boolean. Permission denial follows S10's existing display-restoration convention. A missing node returns `false` without a dispatch or toast; do not recreate it. An unchanged value returns `true` without dispatching. UI actions must not write `canvas`, `rfNodes`, or `node.data` directly.

### `setNodeLabel(id, label)`

For a changed label, return the result of exactly one dispatch:

```js
dispatch([{ type: "node.update", id, patch: { data: { label } } }])
```

- Accept the exact string, including an empty string, leading/trailing spaces, and newlines. Do not trim or silently truncate. No HTML interpretation or rich text.
- Shared `applyOps` remains the validator for wrong types and labels over `NODE_LABEL_MAX`. A direct invalid action call reaches that validator and gets the existing error toast; accepted data and version remain unchanged.
- Compare against the **current canonical label**, not the label captured when editing began. An unchanged label creates no op.
- Patch only `data.label`. Preserve shape, fill, text color, dimensions, position, edges, selection, and valid measurements.

### `setNodeColor(id, paletteName)`

- Resolve `paletteName` by exact `name` in shared `NODE_COLORS`. The component passes a palette name, not an arbitrary object or two independently chosen colors. Unknown/wrong-type names return `false` with no dispatch; do not add a custom-color API.
- If both current `data.color` and `data.textColor` equal the chosen pair, return `true` with no op. Comparing fill alone would fail to repair a mismatched text color in a valid fixture.
- Otherwise return one dispatch of one update:

```js
{
  type: "node.update",
  id,
  patch: { data: { color: pair.fill, textColor: pair.text } },
}
```

- Import `NODE_COLORS` from `@shared/canvasOps.js`; do not copy the palette. Do not send the whole data object: a later color selection must not overwrite a recently edited label.

## Label editing

### Starting and finishing a session

`ShapeNode` owns only whether its editor is open. `NodeLabelEditor` owns the draft and its per-session finished guard. Keep this transient state out of the workspace store and canonical node data.

- Double-clicking the visible body or label of an editable node opens an editor, including when the stored label is empty. Capture the current `data.label` as the initial draft. Focus its textarea without scrolling the page or moving the viewport, and select its text once on mount.
- Double-clicks from handles, resize controls, toolbar buttons, or the already-open textarea must not start or reset an edit session. Viewer double-clicks never open the editor.
- Do not continuously copy `data.label` into a mounted editor's draft; unrelated renders or a color update must not erase typing. A new editor mount initializes from the latest accepted label.
- Use the table below for terminal events. When committing, read the latest textarea value and call the store action once, then close the editor. A rejected action also closes it and returns to the accepted label; the existing toast reports validation failure.
- Guard terminal handling with a ref **before** dispatching or scheduling state updates. Enter may unmount the textarea and cause blur; Escape may also be followed by blur. Neither may cause a second dispatch or turn a cancellation into a save. A state flag alone can be stale within that event sequence.

| Event | Result |
| --- | --- |
| Enter without Shift, outside composition | Prevent newline, commit once, close |
| Shift+Enter | Native newline in draft, stay open, no op |
| Escape outside composition | Prevent default, discard draft, close, no op, including any following blur |
| Blur, including pane click or Tab navigation | Commit once and close; preserve browser focus navigation |
| Enter used to confirm IME composition | Stay open; do not treat it as save |
| Permission loss, node removal, workspace reset, or route unmount | Discard draft; no cleanup/unmount commit |

Use the composition flag (`nativeEvent.isComposing`, with keyCode 229 fallback where needed) before interpreting Enter/Escape. Composition keystrokes must remain available to the input method. Do not submit from composition-end itself.

Permission loss must hide the editor immediately and clear its session, so restoring owner/editor permission does not resurrect the old draft. If blur races with permission loss or node removal, the action's current-state guard prevents a write. Never dispatch from an effect cleanup. Do not unmount the editor merely because selection changed before its ordinary blur handler can commit a pane click.

On Enter/Escape, restore focus to the surviving node wrapper with `focus({ preventScroll: true })` if focus would otherwise fall to the body. Do not steal focus back on ordinary blur, Tab, permission loss, or unmount. A node-local ref or DOM ancestor lookup is sufficient; no global focus registry.

### Rendering and input behavior

- The editor uses the **same per-shape label layer/insets** already defined in `ShapeNode`: preserve `LABEL_LAYERS` and avoid a second mapping. An empty label must still render that layer while editing.
- Replace or hide the static label while editing. Keep the shape body visible. The textarea fills the available inner label area with `w-full h-full min-w-0 min-h-0`, transparent background, no resize grip, centered text, and the existing `text-sm font-medium leading-snug` typography. Text can start at the top while editing; the saved label keeps its existing vertical centering.
- Use `maxLength={NODE_LABEL_MAX}` imported from the shared module and an accessible name such as `Node label`. The limit uses JavaScript string length, as the validator does. Empty and whitespace-only labels are allowed. Normal typing and pasting must respect the 200-unit limit.
- Inherit `data.textColor` from the layer; use token colors for any focus outline/caret chrome. No new palette literals, input backgrounds, placeholder label, auto-growing node, or text-size scaling.
- Put `nodrag nopan nowheel nokey` on the textarea/editor surface. Stop pointer/mouse down, click, and double-click propagation from the editor without preventing normal textarea focus, caret placement, selection, clipboard operations, or scrolling. Stop keydown and keyup propagation, while allowing default text editing except for the terminal keys above. Ctrl/Cmd+A/C/V/X/Z and arrow keys must operate on text, not the canvas.
- Hide the color toolbar and resize controls for this node while its editor is open. Keep connection handle elements in the DOM for anchors; disable their connectability during the edit. When the editor closes, restore S10's normal affordances.

### Double-click and native canvas zoom

The installed React Flow pan/zoom attaches a native double-click listener to the canvas ancestor. Stopping a React **bubble-phase** `onDoubleClick` alone can happen after that native listener has zoomed the viewport. Start editing and stop propagation in an appropriate `onDoubleClickCapture` on the shape's drawing/label surface (or equivalent native-before-zoom handling within `ShapeNode`). Exclude controls and textarea events as above. Do not disable double-click zoom globally or change `WorkspaceCanvas` props. Verify an actual double-click, not only a direct handler call: opening the editor must preserve the entire viewport.

## Color toolbar

Create `ColorToolbar.jsx`, rendered by `ShapeNode` when `canEdit && !editing`. Pass node id and current fill/text colors. The toolbar calls the store's `setNodeColor` action; no network calls or React Flow data mutation APIs.

- Use `NodeToolbar` from `@xyflow/react`, positioned at `Position.Top`, centered, offset 12. Let it use its default visibility rule: it appears for a single selected node and hides for a multiple-node selection. Do not force `isVisible={selected}`; that defeats the installed component's protection against overlapping toolbars. No bulk recolor in this slice.
- `NodeToolbar` portals into React Flow's renderer, inside `.collab-root`, and stays a fixed screen size as the canvas zooms. Do not add a body portal, zoom multiplier, or additional theme root.
- A single horizontal glass pill: `rounded-full`, border using `--collab-border`, background `--collab-glass`, small padding and gaps, with backdrop blur consistent with `ShapePanel`/`CanvasControls`.
- Render eight `type="button"` swatches in `NODE_COLORS` order. Each is a 20px circle with `style={{ backgroundColor: pair.fill }}`. The active pair matches **both** current fields and has a 2px border in `pair.text`; inactive swatches have a 2px transparent border. Use an existing token for a visible keyboard focus ring; do not add a hover-glow effect or an extra palette.
- Each button has an `aria-label` of `<palette name> node color` (for example, `Blue node color`), the palette name as `title`, and `aria-pressed={active}`. Keep active buttons operable/focusable; their no-op behavior belongs in the store. Ordinary buttons in an accessible `role="group"` labelled `Node colors` are enough; do not claim a toolbar/radio keyboard pattern that is not implemented.
- Add `nodrag nopan nowheel nokey` to the toolbar surface. Stop pointer/mouse down, click, double-click, keydown, and keyup propagation as needed without preventing button focus or native Enter/Space activation. Buttons remain usable by Tab and keyboard. Stop **both** pointer and mouse paths: React Flow uses native mouse handlers, and React portal events also bubble through the node's React ancestors.
- The installed library's native input check recognizes `TEXTAREA` and `.nokey`; native buttons alone are not sufficient to isolate Delete/Backspace shortcuts. A focused swatch must not delete/move/deselect the node when those or arrow keys are pressed. Default button activation must still call the color action exactly once.
- Clicking one swatch updates only that node, retains its selection, and leaves the viewport and geometry unchanged. A second click on the active pair does nothing canonical and emits no op.

## Verification for implementation and review

Use temporary external harnesses/in-memory instrumentation as in S10. Observe the actual store's dispatch calls as well as browser behavior; remove all instrumentation before review. Do not install a test framework into the repository. Record exact results, limitations, and screenshot locations in the slice note.

- [ ] **All shapes:** native double-click opens a focused, text-selected editor for each of the six shapes, with empty and existing labels, at zoom 1 and 2 and a panned viewport. Opening changes no canonical data, node geometry, or viewport. Normal selection from the initiating clicks is allowed; opening the editor adds no custom selection rewrite. Test a double-click on the actual label as well as on the body.
- [ ] **Commit paths:** type a changed label and save using Enter, pane-click blur, and Tab in separate runs. Each makes exactly one dispatch containing one update with only `patch.data.label`; blur after Enter makes no second dispatch. The static label displays the accepted text and all unrelated node fields, edges, selection, and version survive. Another add/move/resize/color edit does not reset the label.
- [ ] **Cancellation/no-op:** Escape followed by blur sends no op and restores the original label. Open/close with no change sends no op. Editing a nonempty label to empty and to whitespace preserves those exact values. Reopen after each path and confirm initialization from the current accepted label.
- [ ] **Text cases:** Shift+Enter preserves a newline without saving; save afterward and confirm wrapped multiline rendering. Test leading/trailing spaces, a 200-unit unbroken label, and paste beyond the limit. A direct action with 201 units or a non-string rejects with the existing shared error and preserves accepted state. Text resembling HTML displays literally. No clipping outside the existing saved-label layers.
- [ ] **IME and terminal ordering:** composition Enter does not save, composition-end alone does not save, and a subsequent plain Enter saves exactly once. Escape during composition is left to the input method. Test terminal event sequences under StrictMode; no cleanup-based save or duplicate dispatch.
- [ ] **Keyboard and pointer isolation:** with the textarea focused, Backspace/Delete edit text, arrows move the caret, Ctrl/Cmd+A selects text, and native clipboard/undo shortcuts remain text operations. Mouse selection and wheel scrolling in a long label do not move nodes/pan/zoom. The node survives. Enter/Escape restores node focus without scrolling; Tab and blur preserve the chosen next focus target.
- [ ] **Lifecycle and permissions:** owner and editor can edit; a viewer cannot open the editor or see the toolbar. Demote to viewer with an unsaved draft, then blur: no label op. Re-promote: the old draft does not reopen. Remove the node or reset/unmount the workspace while editing: no stale commit, recreation, toast loop, or leaked listener. New actions called directly as viewer/missing-node return false without mutation. Controlled role tests must be described as controlled tests, not live membership checks.
- [ ] **Palette:** exactly eight named swatches in shared order. Exercise all pairs on a labelled CSS shape and SVG shape; each changed choice sends exactly one update containing both color fields and nothing else. Verify computed body fill, saved-label text color, and active indication. Preserve label, geometry, edges, selection, measurements, and version. Active-pair reselect emits nothing. A valid fixture with matching fill but mismatched text color is repaired by one palette action.
- [ ] **Palette boundaries:** unknown/wrong-type palette names and missing node ids make no dispatch. A valid custom-color fixture (seeded through shared ops) displays no falsely active swatch; choosing a named pair sets both fields. No change to shared hex validation or allowed colors.
- [ ] **Toolbar behavior:** no toolbar at rest, for viewers, during that node's label edit, or during multi-selection. Single selection shows one toolbar; returning from multi-selection restores it. Toolbar swatches stay 20px in screen space at zoom 0.5/1/2, and track the node during viewport pan. Capture and inspect screenshots of all eight palette pairs and a multiline edited label.
- [ ] **Toolbar events/accessibility:** click, double-click, Enter, and Space activate a swatch without opening the label editor or zooming/panning/deselecting. Tab reaches all eight with visible focus and accurate accessible names/pressed states. Backspace/Delete/arrows while a swatch is focused produce no canvas deletion, movement, or extra op. After focus returns to the canvas, S10's delete keys still work normally.
- [ ] **S10 regression:** single/multi-drag, top-left resize, both delete keys, and rejected resize followed by `resizing: false` still behave as approved. Shape drops, hover handles, and shape rendering still work. No label/color op is produced by measurement, pan/zoom, selection, or rendering.
- [ ] Root `npm run build` passes with no new collaborate warnings; report entry/dashboard/workspace JS and scoped CSS sizes and confirm the new editor/toolbar stay lazy. `cd server; npm test` passes (104 tests at baseline). `git diff --check` passes; no production debug hook, new dependency, server change, or imports from chat/blog.
- [ ] Run workflow server boot, `/blog`, and `/chat` regression checks where configured services/sessions permit; distinguish a signed-out chat gate, a socket/API delivery test, and an actual signed-in browser walkthrough. Do not claim one proves another. Clean up any live test data per Q2; do not write users or edit environment files. No external messaging is required by S11 itself.
- [ ] Preserve the approved S10 diff and supplied specs. Inventory only the S11 additions/changes under Allowed files, record verification/deviations, mark S11 **Ready for review**, and stop for Codex. Do not approve, commit, or start S12.
