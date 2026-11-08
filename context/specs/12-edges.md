# Slice 12: Edges

**Lane:** client · **Depends on:** S11 (Committed) · **Unblocks:** S13

**Implementer:** Grok · **Reviewer:** Codex

## Goal and baseline

Owners and editors connect any of the four handles on one shape to any handle on another shape. Connections render as smooth-step arrows with editable midpoint labels. Edge deletion uses S10's existing operation path. Viewers can select and inspect edges but cannot create, label, or delete them.

Read `AGENTS.md`, all six context files, and this spec. Codex authors and reviews this slice at the user's request, taking the roles called Claude's in the older workflow text. S10 and S11 are committed together as `050c1a8`; preserve that baseline and any unrelated working-tree changes. The user handles commits.

This is the last local canvas slice. Canvas opens empty on reload, all content changes still go through `dispatch(ops)` and shared `applyOps`, and canonical version stays unchanged. No persistence, workspace socket events, turns, undo, reconnection of existing edges, or S13 work.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/store/useWorkspaceStore.js` | Add connection and edge-label actions; add display-only marker decoration |
| `src/collaborate/components/canvas/WorkspaceCanvas.jsx` | Register LinkEdge, wire onConnect, style smooth-step connection preview |
| `src/collaborate/components/canvas/LinkEdge.jsx` | New: edge drawing, label placement, edit-session lifecycle |
| `src/collaborate/components/canvas/EdgeLabelEditor.jsx` | New: isolated local text draft and terminal events |
| `src/collaborate/lib/edgePath.js` | Optional new pure rendering helper for self-loop geometry only |
| `src/collaborate/collaborate.css` | Scoped edge/label styles and the two edge color tokens below |
| `context/6-progress-tracker.md` | Slice status, evidence, deviations |

No other implementation files, new dependencies, permanent test framework, server changes, or changes to shared operation semantics. Preserve ShapeNode, NodeLabelEditor, ColorToolbar, existing geometry/deletion actions, and all other canvas props. The accompanying UI-context update is spec-authoring work; do not edit the supplied spec or other context files during implementation.

## Connection action and React Flow wiring

Add `connectNodes(connection)` to the workspace store, returning a boolean:

- Recheck current `selectCanEdit`; denial restores display using the existing convention and returns false without a toast or dispatch.
- A non-record payload returns false without dispatch. For a record, construct a new edge by whitelisting exactly the fields below. Do not spread callback data, call React Flow's `addEdge`, or mutate a display array directly.
- Import `createEdgeId` from `@shared/canvasOps.js`. Each completed valid connection creates a fresh id; parallel edges must not be deduplicated by endpoint or handle pair.
- Dispatch exactly one `edge.add` and return its result. Missing endpoints, invalid handles, and the 600-edge cap remain the shared validator's responsibility; a rejected record uses the existing error toast and leaves accepted state untouched.

```js
{
  id: createEdgeId(),
  source: connection.source,
  target: connection.target,
  sourceHandle: connection.sourceHandle ?? null,
  targetHandle: connection.targetHandle ?? null,
  type: "link",
  data: { label: "" },
}
```

In WorkspaceCanvas, register module-level `edgeTypes = { link: LinkEdge }`. Wire `onConnect` to the action. Retain `ConnectionMode.Loose` and the existing four source handles. Do not add a duplicate-edge or self-loop rejection rule. The library's native restriction against connecting a handle to itself remains; same-node connections between different handles are allowed.

Set `connectionLineType={ConnectionLineType.SmoothStep}` and preview style to the resting edge token with stroke width 1.5. Beginning, moving, or abandoning a connection emits no op; only completed `onConnect` does. Connection attempts begun before permission loss must still be refused by the store's current-state gate.

## Drawing and display data

For different-node edges, use `getSmoothStepPath` with the actual source/target coordinates and handle positions passed by React Flow, retaining its default rounded corners and offset. Use the returned label coordinates, not the arithmetic midpoint of the endpoint coordinates.

Render the path through `BaseEdge`, with `interactionWidth={20}` for the invisible hit path. Do not add a second hit path if BaseEdge already provides it. Clicking the path selects through React Flow's existing edge wrapper. Render a closed arrow at the target.

Add `markerEnd: { type: MarkerType.ArrowClosed, color: "var(--collab-edge)" }` only when building `rfEdges` in `toDisplayEdges`. Keep canonical edges and outgoing ops limited to the existing shared edge fields. Pass React Flow's resolved `markerEnd` prop to BaseEdge. The marker may retain the resting color while the selected stroke brightens; no custom marker registry is needed.

Add these tokens to both existing theme roots in collaborate.css:

| Token | Value |
| --- | --- |
| `--collab-edge` | `rgba(255, 255, 255, 0.4)` |
| `--collab-edge-selected` | `rgba(255, 255, 255, 0.8)` |

Stroke width is 1.5; selected edges use the selected token. No animation, new color palette, edge toolbar, or hover color is required. Use tokens for all chrome, with no color literals in components. Memoize LinkEdge; keep rendering geometry out of canonical data.

### Self-loops and parallel edges: S06 carry-forward decision

Shared validation already allows both, and remains unchanged.

- Different-node parallel edges use the same normal routing and may overlap. Each retains its own id and can be edited/deleted independently through store actions. Automatic lane separation and a chooser for coincident edges are outside this slice; document that visual limitation.
- Same-node edges must render a visible loop outside that node's bounding box, including a fixture whose two anchors coincide. Do not use a zero-length smooth-step path. A curved loop is the explicit exception to normal smooth-step routing. Use React Flow's current internal/display node geometry (for example `useInternalNode(source)`) so it tracks live drag and resize previews, not just committed canonical positions. Route outward from the actual handle sides and put the label on the exterior loop. A finite, nonzero loop and arrow are required; avoid node-center routing.
- A small pure `edgePath.js` helper is permitted to keep this calculation out of the component. It returns render-only path/label coordinates and imports no store or server module. Do not build a general obstacle router. Check all six unordered pairs of different sides on a rectangle, and a same-anchor fixture. Null-handle fixtures may use the positions React Flow resolves; they must not throw or produce NaN.

## Edge-label action

Add `setEdgeLabel(id, label)` alongside the existing node actions:

- Recheck current `selectCanEdit`; viewer denial restores display and returns false without dispatch/toast.
- Look up the current canonical edge. Missing edge returns false without dispatch/toast. Never recreate a deleted edge.
- Compare against its current label. An unchanged string returns true without dispatch.
- Otherwise return exactly one dispatch of `[{ type: "edge.update", id, patch: { data: { label } } }]`.
- Preserve the exact string, including empty strings, whitespace, and newlines. Shared validation enforces `EDGE_LABEL_MAX` (100 JavaScript string units); direct invalid calls reject through the existing toast. No trimming, silent truncation, HTML rendering, or rewriting endpoints/handles/other edges.

## Label presentation and editing

Use `EdgeLabelRenderer` for a small midpoint pill: elevated background, subtle border, primary text, `rounded-full`, `text-xs`, and modest padding. Preserve newlines with wrapping, cap displayed width at 240 canvas units, and use a reasonable max height with clipping for long saved text. No label pill for an empty string. Do not add placeholder text to selected unlabeled edges; their path remains the double-click target.

The label renderer portals into React Flow's viewport and scales with it. Position with `translate(-50%, -50%) translate(labelX, labelY)` and set `pointerEvents: all` on the interactive surface; its portal otherwise has pointer events disabled. Keep the theme inside the existing collab root, without a body portal.

- A native double-click on either the visible path/hit area or label opens a focused, text-selected editor for owners/editors, even when the label is empty. Select the edge through display-only selection if needed so completing an edit can leave it selected. A normal label click selects that edge with the existing Ctrl/Cmd additive-selection convention; background clicks retain normal behavior. Any explicit selection changes use store display actions, never canonical ops.
- Start the edit and stop double-click propagation in capture before React Flow's native ancestor zoom handler. A React bubble handler alone is insufficient. Do not globally disable double-click zoom. Label clicks must not pan, drag nodes, open node editors, or accidentally deselect the edge.
- LinkEdge owns whether the session is open; EdgeLabelEditor owns its local draft and finished ref, patterned after S11. Keep draft state out of the store. Unrelated renders or node moves must not reset it. Do not close merely because selection changes before ordinary blur can save.
- Use a textarea with `maxLength={EDGE_LABEL_MAX}`, accessible name `Edge label`, transparent background, inherited text, and `nodrag nopan nowheel nokey`. Use a usable editing box (about 160px wide, at least two lines); do not resize nodes or change path geometry to fit text.

| Event | Result |
| --- | --- |
| Plain Enter outside composition | Prevent newline; commit once and close |
| Shift+Enter | Insert newline in draft, remain open |
| Blur, including pane click/Tab | Commit once and close; keep the next focus target |
| Escape outside composition | Discard and close; any following blur must not save |
| IME composition Enter/Escape | Leave to input method; no commit or cancellation |
| Permission loss, edge deletion, reset, unmount | Discard without a cleanup commit; regrant must not reopen |

Set a ref guard before dispatch/close so Enter-plus-blur cannot double-submit or Escape-plus-blur save. Use `nativeEvent.isComposing` and keyCode 229 fallback as in S11. Do not commit on composition-end or effect cleanup. Current-state action guards cover permission/deletion races. Render permission loss immediately and clear the old session.

Stop pointer/mouse, click/double-click, keyboard, and wheel propagation as needed while preserving normal text focus, selection, clipboard, undo, and scrolling. Both keydown and keyup stay out of canvas shortcuts; Backspace/Delete edit text. On Enter/Escape, return focus without scrolling to the surviving React Flow edge wrapper if it would otherwise fall to the body; the label portal is not a DOM child of that wrapper, so do not assume `closest` can find it. Ordinary blur/Tab must keep the chosen focus target. No global focus registry or production debug hook.

## Deletion and invariants

Keep S10's `deleteElements`, `onDelete`, and `onEdgesChange` behavior unchanged. A selected edge deletes through one `edge.remove`; deleting a node cascades incident edges through `node.remove`, without redundant removals. Mixed selections retain independently deleted edges whose endpoints survive. Canonical data never contains selection, marker/style, measured geometry, or editor fields. Selection, path recalculation, pan/zoom, and text drafts never dispatch content ops or change version.

## Verification and handoff

Use temporary external/in-memory store and browser harnesses as in S10/S11; remove instrumentation before handoff. Do not add a permanent test framework. Record actual checks and limitations in the tracker, distinguishing controlled roles from live authenticated membership tests.

- [ ] Native connections: all 16 source/target side combinations between two nodes, both drag directions, with representative CSS/SVG shapes at zoom 1 and 2 and a panned viewport. Exactly one edge.add per completion, correct handle ids, fresh ids, no display-only fields. Abandoned gestures emit nothing. Path and arrow update during drag and resize without extra edge ops.
- [ ] Store boundaries: viewer and non-record calls refuse; invalid endpoint/handle records and a 601st edge reject without accepted-state/version changes. Parallel connections retain different ids. Permission loss before completion prevents creation. Null handles normalize correctly in direct-action fixtures.
- [ ] Rendering: resting/selected stroke, target arrow, 20px hit area, midpoint pill, empty labels, long/newline text, and no missing-link-edge warning. Inspect screenshots of a CSS/SVG connection, selected labelled edge, and self-loop. Canonical/ops objects contain no markers or styles after creation and subsequent updates.
- [ ] Self-loops: six distinct-side pairings plus coincident-anchor and null-handle fixtures produce finite exterior paths/label positions, survive move/resize, and can be labelled/deleted. Parallel overlap is recorded as the specified limitation; independent ids and store operations survive.
- [ ] Native double-click on path and label opens once without changing viewport. Enter, pane blur, Tab, Escape-plus-blur, unchanged values, empty/whitespace, literal HTML-looking text, multiline, 100 units, over-limit paste, direct 101-unit/non-string rejection, and IME sequences behave as specified. Accepted edits dispatch one label-only update and preserve endpoints, geometry, selection, other edges, and version.
- [ ] Keyboard/pointer/lifecycle: Delete/Backspace, arrows, clipboard and text undo remain text operations; no pan/zoom while interacting with editor. Enter/Escape restore edge focus without scrolling. Permission loss discards draft; regrant does not reopen. Edge/node deletion, workspace reset, and unmount produce no stale commit or recreation. Viewer cannot open an editor; direct missing-edge calls are harmless. Exercise under StrictMode.
- [ ] Native deletion: standalone edge via both keys, node with incident edges, and mixed selections all use S10's single dispatch/cascade filtering. Viewers cannot delete; deleting an edge never deletes either node. Selection-only events dispatch no op.
- [ ] Regressions: shape drop, single/multi-node drag, top-left resize, rejected resize followed by final dimensions notification, all six shape drawings/handles, node label Enter/Escape/blur, palette selection and focused-swatch shortcut isolation still work. No unexpected content ops from rendering or measurement.
- [ ] Root `npm run build`, server `npm test` (104 at baseline), and `git diff --check` pass. Report entry/dashboard/workspace JS and scoped CSS sizes; new edge code remains in the lazy workspace. No new dependencies, shared/server changes, chat/blog imports, or production instrumentation.
- [ ] Attempt configured server boot and workflow blog/chat regressions where sessions permit. Distinguish a signed-out gate, socket/API delivery, and a signed-in browser walkthrough. Do not send messages to real users. Any integration fixtures must use controlled test accounts and clean up live test data per Q2; never write users or edit environment files. Report unavailable checks honestly.
- [ ] Inventory S12 changes only, add verification/deviations, mark S12 **Ready for review**, and stop for Codex. Do not approve, commit, push, create branches, or start S13.
