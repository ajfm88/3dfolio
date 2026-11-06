# Slice 10: Move, resize, delete as ops

**Lane:** client · **Depends on:** S09 · **Unblocks:** S11

**Implementer:** Grok · **Reviewer:** Codex (assigned by the user for this slice)

## Goal

An owner or editor can move one or several nodes, resize a selected node, and delete selected elements. Each completed gesture changes the canonical canvas only through the store's `dispatch(ops)` action. Intermediate movement and resizing affect React Flow's display arrays only. A subsequent edit must never snap a successfully moved or resized node back to its old geometry.

This is still a local canvas. Reloading or leaving the workspace clears it until S13–S15 add loading and persistence. Do not add socket traffic, REST canvas writes, turn enforcement, or previews in this slice.

Read `AGENTS.md` and its six context files, then this spec. The user has assigned Codex the spec and review roles for S10; the older references to Claude in the workflow describe the usual reviewer, not an additional approval needed for this assignment.

## Starting point

- S08 and S09 are committed together as `7fb9533`. Their rendering, shape drops, selection defaults, and role gates stay intact.
- `useWorkspaceStore.js` owns `canvas`, `rfNodes`, and `rfEdges`. `dispatch` already calls shared `applyOps`, rejects viewers, and preserves the canonical version. It rebuilds display arrays while preserving selection and measurements.
- `onNodesChange` accepts only `select`, `position`, and `dimensions`; `onEdgesChange` accepts only `select`. Neither dispatches ops. Keep those boundaries.
- `WorkspaceCanvas.jsx` currently allows display-only dragging and uses Backspace for deletion, but has no `onNodeDragStop` or `onDelete` handler.
- `ShapeNode.jsx` currently renders props only. S10 explicitly permits store selectors for editability and the resize action; drawing helpers remain props-only.
- Shared limits are `NODE_SIZE_MIN = 40`, `NODE_SIZE_MAX = 2000`, `POSITION_MAX = 100000`, and `MAX_OPS_PER_COMMIT = 50`. Import constants; do not duplicate or change them.

## Allowed files

| File | Change |
| --- | --- |
| `src/collaborate/store/useWorkspaceStore.js` | End-of-gesture actions, display reconciliation on rejection, and narrowly scoped handling of resize-end display changes |
| `src/collaborate/components/canvas/WorkspaceCanvas.jsx` | Wire drag-stop and delete callbacks, enable both delete keys for editors |
| `src/collaborate/components/canvas/ShapeNode.jsx` | Add role-gated `NodeResizer`, dispatch through a store action at resize end |
| `src/collaborate/collaborate.css` | Scoped resize handle and outline styling |
| `context/6-progress-tracker.md` | Implementation status, verification evidence, and deviations |

No new production files, dependencies, test framework, server changes, other context changes, or edits outside this table. This spec is already supplied for implementation; do not silently rewrite its requirements. No commits, branches, or pushes.

## Store actions

Keep operation construction in the workspace store so components only pass callback data to actions. Add these actions with the following contracts; small private helpers may live in the same file:

### `commitNodePositions(nodes)`

Called by `onNodeDragStop(event, node, nodes)` with its **third argument**, the array of all nodes moved by that gesture. Do not dispatch just the primary node, scan all selected nodes instead of using the callback array, or register a second commit through `onSelectionDragStop`.

- Read the current state when the action runs and recheck `selectCanEdit`.
- Build one `node.update` per distinct existing node whose final position differs from its canonical position:

```js
{ type: "node.update", id, patch: { position: { x, y } } }
```

- Copy only `id` and `position.x/y` from the callback data. No display objects or flags reach an op.
- Dispatch the entire nonempty list once. A click, selection-only change, or drag that ends at the original position produces no dispatch. Do not round coordinates or add a snap grid.
- The shared validator remains responsible for invalid coordinates. A rejected gesture restores the display as described below.

The installed React Flow implementation calls `onNodeDragStop` with the full dragged-node array for ordinary and selection drags. Preserve Ctrl-click on Windows / Cmd-click on macOS for multi-selection and Shift-drag for box selection (resolved Q6).

### `commitNodeResize(id, params)`

Called only by `NodeResizer`'s `onResizeEnd(event, params)`.

- Read current state and recheck editability. Find the canonical node by id.
- Build exactly one update with this whitelist:

```js
{
  type: "node.update",
  id,
  patch: {
    position: { x: params.x, y: params.y },
    width: params.width,
    height: params.height,
  },
}
```

- Use the callback's final geometry, including `x/y`; a top or left resize moves the node origin. Do not use the node render's captured position or derive sizes from a DOM rect, which includes zoom.
- Skip dispatch if all four geometry values equal the canonical values. Do not force square circles, keep an aspect ratio, or change labels or colors.
- Do not dispatch in `onResize`, `onResizeStart`, or `onNodesChange`.

### `deleteElements({ nodes, edges })`

Called only by React Flow's `onDelete` callback. Read current canonical state and recheck editability.

1. Deduplicate the existing node ids in the callback and create one `node.remove` per id.
2. Deduplicate existing edge ids in the callback. Create `edge.remove` only for edges whose source **and** target are outside the set of nodes being removed.
3. Dispatch node removals followed by those independent edge removals as one nonempty batch. Skip an empty request.

`node.remove` already removes every incident edge in `applyOps`. React Flow also includes incident edges in `onDelete`'s `edges` array. Emitting `edge.remove` for these after the node removals would fail with `Edge not found` and reject the entire batch. Add a short comment explaining the filtering. Endpoint checks use the canonical edge, not additional fields trusted from the callback.

Do not add `onNodesDelete` or `onEdgesDelete` dispatches. Keep ignoring `remove` changes in both display change handlers, so React Flow's notifications cannot apply a deletion twice or remove elements before validation.

Although edge creation and `LinkEdge` arrive in S12, implement this callback contract now. Verify it with temporary edge fixtures through shared ops; do not build edge UI in S10.

### Batch size and rejected gestures

Keep one dispatch per gesture and the existing 50-op limit. Do not split a gesture into several batches or raise the shared limit. Fifty changed nodes may move or delete together; a gesture requiring 51 ops rejects atomically with the existing shared error toast. Cascaded edges do not count as explicit ops.

Extend `dispatch` so a shared validation failure reconciles both display arrays from the unchanged canonical canvas before returning `false`, preserving selection for surviving elements. Keep the existing error toast and return contract. A permission rejection also restores the display without producing ops. The gesture actions must reconcile display-only changes if they stop at their own permission guard. Do not reset the workspace or change canonical data/version to achieve this.

Reconciliation must restore effective node dimensions as well as `position`, `width`, and `height`. A resized node's stale `measured` values must not override the restored size. Preserve measurements that still describe the canonical size; replace or invalidate incompatible measurements. Do not retain `dragging` or `resizing` as true after a gesture has ended.

**Installed-library ordering to account for:** `NodeResizer` calls the supplied `onResizeEnd` first, then React Flow emits a final `dimensions` change with `resizing: false` and the attempted width/height. After a rejection, blindly applying that notification would put the rejected dimensions back into `rfNodes`. Handle this narrowly in `onNodesChange`: a final `resizing: false` dimensions change must settle to the node's current canonical width/height. Regular measurement changes and in-progress resize changes remain display-only and never dispatch. Do not dispatch another update to repair the final notification.

## Canvas wiring

In `WorkspaceCanvas.jsx`, select the new `commitNodePositions` and `deleteElements` actions.

- Add a stable drag-stop callback that passes the third callback argument to `commitNodePositions`.
- Pass the delete action to `onDelete` (a stable wrapper is also acceptable).
- Set `deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}`.
- Keep all existing shape-drop handlers, type maps, connection mode, zoom limits, background, controls, panel gating, and viewport behavior.

All actions retain their own role check even though React Flow also gates editing. A viewer may select, pan, zoom, and fit, but may not move, resize, or delete content. No new global keyboard listener or toolbar button is needed.

## Node resizer

In `ShapeNode.jsx`, receive the node's `id` prop, select `selectCanEdit` and `commitNodeResize`, and add `NodeResizer` from `@xyflow/react` inside the existing root.

- Render resize controls only when `selected && canEdit`. Using `isVisible={selected && canEdit}` is acceptable.
- Use `NODE_SIZE_MIN` for both minima and `NODE_SIZE_MAX` for both maxima.
- Leave aspect-ratio locking off. All six shapes can stretch along either axis, as their S09 rendering already supports.
- The resize-end callback passes `id` and the callback params to the action. Keep it stable with `useCallback`.
- Do not use `isConnectable` as permission to resize. Keep forwarding that prop to all four handles as before.
- Keep shape geometry, label layers, handle positions, selected borders, and `memo` behavior intact. Update the obsolete props-only comment if necessary; do not refactor the render helpers.

Use custom `handleClassName` and `lineClassName` on `NodeResizer` and style them in `collaborate.css`, scoped under `.collab-root .react-flow__node-shape`:

- Handles: 8px circles, `--collab-node-border-selected` fill, 1px `--collab-bg` border.
- Outline: 1px dashed `--collab-node-border-selected`.
- No new tokens, raw hex literals, animation, or global `.react-flow__resize-control` overrides. Preserve React Flow's positioning, hit behavior, and cursors.

## Not in this slice

- Inline labels, color toolbar (S11), edge creation/rendering (S12).
- Server persistence, socket joins/commits, remote sync, turns, or drag/resize preview broadcasts (S13 onward).
- Undo/redo, delete confirmation, context menus, alignment/snapping, touch shape adding, or custom keyboard movement.
- A general pending-gesture system or unrelated store refactor.

## Verify when done

Use temporary instrumentation or an external harness to observe `dispatch` calls, the canonical canvas, and display arrays. Remove all instrumentation before review. Do not add a permanent UI test framework or ship a dev hook. Report actual evidence and distinguish controlled component checks from real signed-in browser checks.

- [ ] **Single drag:** add a node, drag at zoom 1 and 2 with a panned viewport, and inspect both states before and after release. During drag only `rfNodes` changes; release dispatches one position update, and canonical/display positions agree. Add another shape afterward: the moved node stays put.
- [ ] **Multi-drag:** Ctrl/Cmd-select at least three different shapes, drag one, and repeat after Shift-drag box selection. Exactly one dispatch contains one update per moved node, relative offsets are preserved, and all canonical positions match the display. No duplicate commit from a selection callback.
- [ ] **Resize:** each of the six shapes resizes from bottom-right and top-left at zoom 1 and 2. During resize only the display changes; release dispatches one update containing final position, width, and height. The opposite corner stays fixed for a top-left resize. Adding another shape afterward does not reset geometry. Inspect a screenshot of resized shapes for unclipped rendering and correctly anchored handles.
- [ ] **Bounds:** resize cannot go below 40 or above 2000 on either axis. Width and height can differ for circles. Clicking/releasing a resize control without changing geometry produces no dispatch.
- [ ] **Measurements and selection:** initial measurement, pane clicks, Ctrl/Cmd clicks, pan, zoom, and fit produce no canvas ops. Mount/re-measure causes no resize commit loop. Selection survives successful geometry updates and rejected gestures.
- [ ] **Delete keys:** Backspace and Delete each remove a selected node; both also delete a multiple-node selection through one dispatch. The canonical and display arrays agree. Empty selection does nothing. No `remove` notification produces a second dispatch.
- [ ] **Cascade fixtures:** through temporary `dispatch` calls, create nodes A/B/C and edges AB/BC. Invoke the delete path with node A and edges AB/BC: the batch contains `node.remove A` and `edge.remove BC`, but no explicit removal of AB; the result contains B/C and no edges. Also check edge-only deletion and deleting both endpoints of one edge. Every batch succeeds without `Edge not found`.
- [ ] **Batch boundary:** a 50-node move and 50-node delete succeed. A 51-node move and 51-node delete each produce one rejected dispatch, one existing validation toast, no partial canonical changes, and display geometry/content restored. Seed large fixtures in batches of at most 50 through shared ops.
- [ ] **Rejected geometry:** attempt an out-of-range drag and a resize with invalid position through controlled callbacks. The canonical canvas stays unchanged and the display returns to canonical geometry. For resize, also deliver the subsequent `resizing: false` notification with rejected dimensions and confirm it cannot reintroduce them.
- [ ] **Viewer:** in a controlled viewer state, selected nodes have no resize controls; dragging and either delete key do not change content. Calling each new action directly also leaves canonical content unchanged and clears any attempted display-only geometry. Owner and editor both pass the editing checks. If real authenticated role checks are unavailable, record that limitation.
- [ ] Shape-panel drops, selected borders, labels, and hover handles still work. Resizer code and CSS remain in the lazy collaborate/workspace chunks; inspect build output and report entry/dashboard/workspace sizes, explaining any change.
- [ ] Root `npm run build` passes with no new collaborate warnings. `cd server; npm test` passes. `git diff --check` passes. No production instrumentation, raw palette literals, chat/blog imports, dependencies, or server changes.
- [ ] Run the workflow's server boot, `/blog`, and two-account `/chat` DM/typing/presence regression checks where configured sessions allow. Report any blocked or unrun checks explicitly; a signed-out gate does not establish DM delivery. Clean up any live test project data per Q2, never write users, and do not edit environment files.
- [ ] Diff is confined to the Allowed files. Mark S10 **Ready for review** and add a Grok slice note with changed files, verification evidence, deviations, and pending checks. Stop for Codex review; do not mark Approved or start S11.
