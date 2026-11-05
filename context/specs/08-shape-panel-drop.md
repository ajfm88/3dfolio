# Slice 08: Shape panel and drop

**Lane:** client · **Depends on:** S07 · **Unblocks:** S09

## Goal

An owner or editor can drag any of the six shapes from a floating panel onto the canvas. The new node lands **centered under the cursor**, at any zoom or pan, and the viewport doesn't move. Each drop is one `node.add` op through the store's `dispatch`, so the shared `applyOps` validates it exactly as the server will.

Nodes still render with React Flow's fallback node in this slice (a plain box with the console's missing-type warning). That's expected: `ShapeNode` arrives in S09. The canvas is still local only and empty on every load until S13 and S15.

## Design

```text
src/collaborate/
├── lib/
│   └── shapeDrag.js                   ← new: drag data type + node builder (pure)
└── components/canvas/
    ├── ShapePanel.jsx                 ← new
    └── WorkspaceCanvas.jsx            ← edit: drop handling, render ShapePanel
```

No other file changes. No server change, no store change, no new dependency, no CSS file change.

### Layout

```text
┌──────────────────────────────────────────────────────────┐
│ ← Projects   Project name                       [editor] │
├──────────────────────────────────────────────────────────┤
│ · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·│
│ · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·│
│ ( + − ⛶ )          ( ▭ ◇ ○ ⬭ ⛁ ⬡ )                      │  ShapePanel: bottom center
└──────────────────────────────────────────────────────────┘
```

On narrow screens the two pills would overlap, so below `sm` the shape panel sits one row higher (see ShapePanel).

### How a drop works

1. `dragstart` on a panel item writes the shape name under a custom data type and sets a drag image (the ghost) at the node's on-screen size, held at its center.
2. `dragover` on the canvas accepts only that data type.
3. `drop` reads the shape, converts the cursor's screen point to flow coordinates with `screenToFlowPosition`, and dispatches `node.add` with the node's top-left set to that point minus half the default size.

Because the ghost is held at its center and is drawn at `default size × zoom`, the ghost the user sees while dragging is exactly where the node lands.

## Implementation

### `src/collaborate/lib/shapeDrag.js` (new, pure)

Imports only from `@shared/canvasOps.js`. No React, no store, no DOM.

```js
export const SHAPE_DRAG_TYPE = "application/x-collab-shape";
export function createShapeNode(shape, center) { ... }
```

- `SHAPE_DRAG_TYPE` is lowercase on purpose: browsers lowercase `dataTransfer.types`, and `dragover` can only see types, not data. Say so in a comment.
- `createShapeNode(shape, center)`:
  - Returns `null` when `shape` isn't in `NODE_SHAPES` (data from another page or tab can carry any string).
  - Otherwise returns `{ id: createNodeId(), type: "shape", position: { x: center.x - width / 2, y: center.y - height / 2 }, width, height, data: { label: "", shape, color: DEFAULT_NODE_COLOR.fill, textColor: DEFAULT_NODE_COLOR.text } }`, with `width` and `height` from `DEFAULT_NODE_SIZE[shape]`.
  - Don't round the position. Rounding would move the node off-center by up to half a pixel at high zoom.
- It doesn't validate ranges. `applyOps` is the only validator; a drop beyond the position limit is rejected there with its own message.

### `src/collaborate/components/canvas/ShapePanel.jsx` (new)

**Placement and look**

- `absolute left-1/2 -translate-x-1/2 z-10 bottom-16 sm:bottom-4`. Below `sm` it sits above `CanvasControls` so the two pills never overlap at 390px wide. Add a one-line comment saying so.
- Glass pill, same classes as `CanvasControls`: `rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] p-1 backdrop-blur`, items in a row with `gap-1`.
- The container is `role="toolbar"` with `aria-label="Shapes"`.

**Items**, in `NODE_SHAPES` order, one per shape. Icons are lucide, `h-5 w-5`:

| Shape | Icon | Title |
| --- | --- | --- |
| rectangle | `RectangleHorizontal` | Rectangle |
| diamond | `Diamond` | Diamond |
| circle | `Circle` | Circle |
| pill | `Pill` | Pill |
| cylinder | `Cylinder` | Cylinder |
| hexagon | `Hexagon` | Hexagon |

Map shape → icon and title in a module-level object. Iterate `NODE_SHAPES` from the shared module so a shape can't be offered that the validator doesn't know.

- Each item is a `<div draggable>`, **not** a `<button>`. Firefox never starts a drag on a `<button>`, and a button that does nothing on click or Enter would mislead keyboard and screen-reader users. Comment the first reason.
- Classes: `rounded-full p-2 cursor-grab active:cursor-grabbing text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)]`.
- `title={`Drag to add a ${title.toLowerCase()}`}` and an `sr-only` span with the title, so the toolbar's contents can be read.
- No `onClick`, no keyboard handler, no touch handler. See "Not in this slice".

**Ghosts**

- Render six ghost elements, one per shape, inside a single wrapper: `aria-hidden="true"`, `pointer-events-none fixed top-0 left-[-10000px]`. Off-screen, because `setDragImage` needs an element that is in the document and laid out, but the user must never see it outside a drag.
- Each ghost: `flex items-center justify-center border-2 border-dashed border-[var(--collab-accent-2)] bg-[var(--collab-glass)] text-xs text-[var(--collab-muted)]`, containing the shape's title. Circle and pill use `rounded-full`; the other four use `rounded-lg`. Write each class string literally (Tailwind only sees literal class names). The ghost shows the node's footprint, not the final shape; S09 owns shape drawing, and this ghost can stay as is.
- Keep the ghosts in a ref map (`shape → element`).

**`onDragStart(event, shape)`**

1. `event.dataTransfer.setData(SHAPE_DRAG_TYPE, shape)` and `event.dataTransfer.effectAllowed = "copy"`.
2. Read `zoom` from `useReactFlow().getZoom()` **at drag start** (not a subscription; the viewport can't change mid-drag).
3. Set the ghost's `style.width` and `style.height` to `DEFAULT_NODE_SIZE[shape] × zoom` in px. These two inline sizes are the only inline styles; no inline colors.
4. `event.dataTransfer.setDragImage(ghost, width / 2, height / 2)`.

**Visibility.** `WorkspaceCanvas` renders the panel only when `selectCanEdit` is true. The panel doesn't read the role itself.

### `src/collaborate/components/canvas/WorkspaceCanvas.jsx` (edit)

Inside `Flow` (it's already inside `ReactFlowProvider`):

- Add `const { screenToFlowPosition } = useReactFlow();` and `const dispatch = useWorkspaceStore((s) => s.dispatch);`.
- `onDragOver(event)`: if `canEdit` and `event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)`, call `event.preventDefault()` and set `event.dataTransfer.dropEffect = "copy"`. Otherwise do nothing, so a viewer or a foreign drag (a file, selected text) gets the browser's "not allowed" cursor and default behavior.
- `onDrop(event)`: if `!canEdit` or the type is missing, return without calling `preventDefault`. Otherwise `preventDefault()`, read `event.dataTransfer.getData(SHAPE_DRAG_TYPE)`, compute `screenToFlowPosition({ x: event.clientX, y: event.clientY })`, build the node with `createShapeNode`, and if it isn't `null`, `dispatch([{ type: "node.add", node }])`. An unknown shape is ignored silently.
- Wrap both handlers in `useCallback`.
- Pass them as `onDragOver` and `onDrop` props on `<ReactFlow>` (it forwards them to its wrapper div).
- Render `{canEdit && <ShapePanel />}` as a child of `<ReactFlow>`, after `<CanvasControls />`.
- Don't change anything else: no `fitView`, no `setCenter`, no selection of the new node, and no change to the existing props or the module-level `nodeTypes`/`edgeTypes` comment.

`screenToFlowPosition` already accounts for the canvas's offset in the page, pan, and zoom. Don't subtract `getBoundingClientRect()` yourself; that would offset the node by the navbar height.

## Not in this slice

- Click, Enter, or touch to add a shape. HTML5 drag events don't fire for touch on most mobile browsers, so phones can't add shapes yet. The tracker carries this to S29 (mobile and accessibility). Don't add any of them here.
- Real shape rendering, handles, and the shape outline in the ghost (S09).
- Selecting or label-editing the new node (S11).
- Any socket or server work (S13+).

## Dependencies

- None new. lucide-react already ships all six icons (checked against the installed version).
- `createNodeId()` uses `crypto.randomUUID()`, which browsers expose only on HTTPS or `localhost`. Test on `localhost`. On plain `http://<LAN-IP>` every drop would fail; that's a known limit, not a bug in this slice.

## Verify when done

- [ ] `npm run build` passes with only the existing large-chunk warning. `ShapePanel` and `shapeDrag` are in the `WorkspacePage-*` chunk, not the entry or the dashboard's `Collaborate-*` chunk. Name the chunk sizes in the slice note.
- [ ] As the owner, each of the six shapes can be dragged onto the canvas. Each drop adds exactly one node, and the store's canonical node has `type: "shape"`, the dragged shape, its `DEFAULT_NODE_SIZE`, an empty label, and the neutral fill and text colors.
- [ ] **Centering**, measured, not eyeballed. Drop shapes at zoom 1, at the minimum zoom (0.2), at the maximum zoom (2), and after panning. For each, the center of the node element's `getBoundingClientRect()` is within 1px of the drop's `clientX`/`clientY`. Record the numbers in the slice note. (The fallback node is `box-sizing: border-box` and takes its size from the node's `width`/`height`, so its rect is the node's real footprint.)
- [ ] The viewport transform (`getViewport()`) is identical before and after every drop.
- [ ] The ghost during a drag is the dashed footprint at the current zoom, with the cursor at its center (check at zoom 1 and zoom 2 in Chrome; note what Firefox shows).
- [ ] Dropping a file or dragged text onto the canvas adds nothing and doesn't throw.
- [ ] As a viewer (set up and cleaned up per Q2, as in S07), the panel isn't rendered, and a shape dragged from an owner's tab into the viewer's window adds nothing.
- [ ] An invalid drop goes through `applyOps`'s message: with a temporary dev-only hook (removed before review, no trace in `git diff`), set the viewport so the drop point is beyond the 100,000 position limit, drop, and see the shared module's position toast with no node added. Write down what you ran.
- [ ] At 390×844 the shape panel and the zoom pill don't overlap, and neither causes an outer scrollbar.
- [ ] Every panel item has a title and screen-reader text. No `<button>` is draggable.
- [ ] `grep` shows no raw hex in the new files, no imports from `src/chat/` or `src/blog/`, and no `onClick` or touch handlers on the panel items.
- [ ] `cd server && npm test` still passes (no server change).
- [ ] `/blog` loads, and `/chat` sends a DM.
- [ ] `git diff` touches only the three files under Design, plus the tracker.
- [ ] The tracker marks S08 **Ready for review** with its slice note.
