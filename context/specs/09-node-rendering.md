# Slice 09: Node rendering

**Lane:** client · **Depends on:** S08 · **Unblocks:** S10

## Goal

Every node on the canvas renders as its real shape (rectangle, diamond, circle, pill, cylinder, or hexagon), filled with its color, with its label centered in its text color. Each node has four connection handles (`top`, `right`, `bottom`, `left`) that appear on hover for owners and editors. A selected node shows a brighter border. React Flow's fallback node and its missing-type warning are gone.

Rendering only. Nothing new is dispatched in this slice: moving, resizing, and deleting become ops in S10, label editing and the color toolbar arrive in S11, and edges in S12. The canvas is still local only until S13–S15.

## Design

```text
src/collaborate/
├── collaborate.css                       ← edit: two node-border tokens, handle rules
└── components/canvas/
    ├── ShapeNode.jsx                     ← new
    └── WorkspaceCanvas.jsx               ← edit: register ShapeNode, ConnectionMode.Loose
```

No store, server, dependency, or ShapePanel change. `context/3-ui-context.md` already lists the two new tokens (Claude added them with this spec).

### How each shape is drawn

The React Flow node wrapper already has the node's `width` and `height` as inline sizes (`box-sizing: border-box`). `ShapeNode`'s root fills it (`relative h-full w-full`), and everything inside is positioned against that box.

| Shape | Drawn with | Body |
| --- | --- | --- |
| rectangle | CSS | a `div` with `rounded-lg` |
| pill | CSS | a `div` with `rounded-full` |
| circle | CSS | a `div` with `rounded-full` (an ellipse when width ≠ height; that's intended) |
| diamond | inline SVG | `polygon` `50,0 100,50 50,100 0,50` |
| hexagon | inline SVG | `polygon` `25,0 75,0 100,50 75,100 25,100 0,50` (flat top and bottom) |
| cylinder | inline SVG | outline `path` `M0,12 A50,12 0 0 1 100,12 L100,88 A50,12 0 0 1 0,88 Z` plus the top rim's front arc `M0,12 A50,12 0 0 0 100,12` |

Every SVG uses `viewBox="0 0 100 100"`, `preserveAspectRatio="none"`, `overflow="visible"`, and `className="absolute inset-0 h-full w-full"`. Every SVG shape element uses `vectorEffect="non-scaling-stroke"` and `strokeWidth={1}`.

- `preserveAspectRatio="none"` stretches the shape to any width and height.
- `non-scaling-stroke` keeps the border 1px however unevenly the shape is stretched; without it a wide diamond would get thick and thin edges.
- `overflow="visible"` keeps the half of the stroke that falls outside the viewBox, so the diamond's and hexagon's points aren't clipped.

Put one comment above the SVG shapes saying why each of the three attributes is there.

### Colors and border

- Fill: `data.color`. Label color: `data.textColor`. Both are inline styles (`backgroundColor` / `fill` for the body, `color` for the label). They come from `canvasOps.js` through the store, so this is the one allowed exception to the no-raw-hex rule (see `3-ui-context.md` → Node palette). No hex literal appears in the component itself.
- Border: 1px. `var(--collab-node-border)` at rest, `var(--collab-node-border-selected)` when `selected`. CSS shapes use `border` with `border-[var(--collab-node-border)]` or `border-[var(--collab-node-border-selected)]`. SVG shapes set `stroke` to the same `var(...)` string. The cylinder's rim arc uses the same stroke and `fill="none"`.

### Label

- Rendered only when `data.label` is non-empty.
- An absolutely positioned layer over the body (`absolute flex items-center justify-center overflow-hidden text-center`), so it is centered the same way for CSS and SVG shapes.
- Text: `text-sm font-medium leading-snug`, `whitespace-pre-wrap break-words` (labels can contain newlines from S11), color `data.textColor`.
- The layer's **insets** keep text inside the visible shape. Use insets, not percentage padding: CSS resolves percentage padding against the width on every side, so a wide, short diamond would get vertical padding taller than the node. Percentage `top`/`bottom` follow the height and `left`/`right` the width. Use these literal classes on the layer:

| Shape | Label layer |
| --- | --- |
| rectangle, pill | `inset-0 px-3 py-2` |
| circle | `inset-[15%]` |
| diamond | `inset-[25%]` |
| hexagon | `inset-y-0 inset-x-[20%] py-2` |
| cylinder | `inset-x-0 bottom-0 top-[24%] px-3 pb-2` (below the top ellipse) |

Add a one-line comment saying why insets and not padding.

Text that doesn't fit is clipped by `overflow-hidden`. No ellipsis, no line clamp, no font scaling.

### Handles

- Four `<Handle>`s from `@xyflow/react`, all `type="source"`, ids `top`, `right`, `bottom`, `left` (the shared `HANDLE_IDS`), with `Position.Top`, `Position.Right`, `Position.Bottom`, `Position.Left`. Render them from `HANDLE_IDS` with a module-level id → `Position` map.
- Always render all four, for every role. S12's edges anchor to handle elements, so a viewer still needs them in the DOM.
- `ShapeNode` receives React Flow's `isConnectable` node prop (derived from `nodesConnectable`) and passes it to all four `Handle`s. `Handle` defaults `isConnectable` to `true` and doesn't read the canvas setting itself, so without this a viewer's handles would be connectable and get the `connectable` class. Comment this. (Corrected 2026-11-04: the first version of this spec said not to pass it; Codex found the default in the installed source.)
- `WorkspaceCanvas` passes `connectionMode={ConnectionMode.Loose}`, so a source handle can connect to a source handle. Edges themselves arrive in S12; nothing has to work with connections yet.

**Handle styling** goes in `collaborate.css`, scoped to this node type:

```css
.collab-root .react-flow__node-shape .react-flow__handle { ... }
```

- 8×8px, `--collab-accent-2` fill, a 1px `--collab-bg` border (so the dot reads against any node color), via React Flow's `--xy-handle-background-color` and `--xy-handle-border-color` variables plus `width`/`height`.
- Hidden (`opacity: 0`) by default. Visible (`opacity: 1`) when the node is hovered **and** the handle has the `connectable` class: `.react-flow__node-shape:hover .react-flow__handle.connectable`. A viewer never sees handles. A short opacity transition is fine; respect `prefers-reduced-motion` by dropping it.
- One comment explaining why handles stay in the DOM for viewers.

### Tokens

Add to the shared `.collab-root, .collab-portal` token block in `collaborate.css`, after `--collab-warning`, values exactly as in `3-ui-context.md`:

```css
--collab-node-border: rgba(255, 255, 255, 0.1);
--collab-node-border-selected: rgba(255, 255, 255, 0.35);
```

That makes 19 tokens. Nothing else in the existing token block changes.

## Implementation

### `src/collaborate/components/canvas/ShapeNode.jsx` (new)

- `const ShapeNode = ({ data, selected, isConnectable }) => ...`, exported as `memo(ShapeNode)`. Comment: React Flow re-renders nodes on every viewport and selection change, and memo skips nodes whose props didn't change.
- Imports: `memo` from react; `Handle`, `Position` from `@xyflow/react`; `HANDLE_IDS` from `@shared/canvasOps.js`. Nothing from the store: a node renders only its props.
- A module-level map from shape to its label layer classes, and a small render function or component per drawing method (CSS body vs. SVG body). Keep it in this one file.
- An unknown `data.shape` can't reach this component (the store only holds `canvasOps` output), so don't add a fallback branch for it.
- Don't add `NodeResizer`, `NodeToolbar`, double-click handling, or any `nodrag`/`nopan` classes. Those belong to S10 and S11.

### `src/collaborate/components/canvas/WorkspaceCanvas.jsx` (edit)

- `const nodeTypes = { shape: ShapeNode };` at module scope. Keep `edgeTypes = {}`.
- Update the comment above them: drop the sentence about fallback rendering and the S07–S08 warning, and keep the reason they live at module scope and that `LinkEdge` (S12) registers here.
- Add `connectionMode={ConnectionMode.Loose}` to `<ReactFlow>` (import `ConnectionMode`).
- Nothing else changes: the drop handlers, the `ShapePanel` gate, `CanvasControls`, and every other prop stay as they are.

### `src/collaborate/collaborate.css` (edit)

The two tokens and the handle rules above. Read the handle variable names from `node_modules/@xyflow/react/dist/style.css` (`--xy-handle-background-color`, `--xy-handle-border-color`). Only `var(--collab-*)` values. Nothing else in the file changes.

## Not in this slice

- Moving as an op, resizing, deleting (S10). Dragging a node still moves it on screen only.
- Label editing and the color toolbar (S11). To see labels and colors now, use the temporary hook below.
- Edges, edge rendering, and the connection line style (S12).
- Changing the ShapePanel ghost to the real shape outline.

## Verify when done

- [ ] `npm run build` passes with only the existing large-chunk warning. `ShapeNode` is in the `WorkspacePage-*` chunk; the entry and dashboard chunks are unchanged in size. Name the sizes in the slice note.
- [ ] Dropping each of the six shapes renders that shape, not a box, at its default size. The console shows no missing node type warning and no React key or prop warnings.
- [ ] **Odd sizes**, with a temporary dev-only hook (removed before review, no trace in `git diff`): dispatch `node.add` for every shape at 40×40, 400×60, 60×400, and 300×300. Each shape stretches to fill its box, the border stays 1px on every side (zoom to 2 and inspect diamond, hexagon, and cylinder), and the diamond's and hexagon's points aren't clipped. Screenshot the grid and inspect it.
- [ ] Using the same hook, dispatch nodes with each of the 8 palette pairs and with labels: one short, one with a `\n`, one 200 characters long. The fill and text color match the pair, the newline breaks the line, and the long label wraps and is clipped inside the node, not drawn outside it. The cylinder's label sits below the top ellipse.
- [ ] The rendered node's `getBoundingClientRect()` still equals `width × zoom` by `height × zoom`, and S08's drop centering still holds (re-run one drop per shape at zoom 1 and 2, within 1px).
- [ ] Every node has four handles in the DOM with `data-handleid` `top`, `right`, `bottom`, `left`, sitting on the middle of each side. As the owner they're invisible until hover and visible on hover. As a viewer (set up and cleaned up per Q2) they stay invisible on hover but are still in the DOM.
- [ ] Clicking a node shows the selected border; clicking the pane returns it to the rest border. Ctrl-click (Cmd-click on macOS) selects two, and both show it. (Corrected 2026-11-04: React Flow's default multi-select key is Ctrl/Cmd; Shift is box select. See Q6.)
- [ ] `grep` shows no hex literal in `ShapeNode.jsx` or `WorkspaceCanvas.jsx`, no imports from `src/chat/` or `src/blog/`, and no store import in `ShapeNode.jsx`.
- [ ] `collaborate.css` has 19 tokens, the 17 existing ones unchanged, and the two new values match `3-ui-context.md` exactly.
- [ ] `cd server && npm test` still passes (no server change).
- [ ] `/blog` loads, and `/chat` sends a DM.
- [ ] `git diff` touches only the three files under Design, plus the tracker. (`3-ui-context.md` and this spec were changed by Claude before the slice and aren't part of the implementation diff.)
- [ ] The tracker marks S09 **Ready for review** with its slice note.
