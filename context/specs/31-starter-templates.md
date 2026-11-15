# Slice 31 — Starter templates

**Execution status (2026-11-14): Todo.** Spec written; implementation not started.

**Lane** client · **Depends on** S29b (Approved; its `ShapePanel.jsx`, `EmptyCanvasHint.jsx` and `mobileA11y.test.mjs` must be in the tree) · **Unblocks** nothing

**Spec author** Claude Fable 5.2 · **Implementer / Reviewer** assigned by the user

## Why this slice exists

Starter templates were out of scope in the original plan. On 2026-11-14 the user asked for them, after comparing `/collaborate` with the Ghost AI reference app, whose only non-AI feature we lack is its three starter templates: Microservices, CI/CD Pipeline and Event-Driven System. This slice adds the same three diagrams, built for our canvas.

It is an addition after the 30-slice build plan (Phase L in `00-build-plan.md`). It does not block the launch QA or the drawDB track.

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, and this spec. Recheck `git status` and `git log -3`. S29a, S29b and S30 may be committed or still uncommitted; either way, change none of their files except the ones this spec names.

Baseline from the S30 review: server suite **328**; twelve root client suites **293**; production build passing.

What the holder gets: a **Templates** button in the shape panel, a dialog listing three templates with a small preview each, and an **Add to canvas** button that inserts the chosen diagram.

Design decisions, made by the spec author:

1. **A template is added, never substituted for the canvas.** Ghost AI replaces the whole canvas. Ours is shared, a replace would delete other people's work, and removing up to 300 nodes cannot fit one 50-op commit. Adding is 13 or 14 ops, one commit, one undo frame.
2. **Templates are client data turned into ordinary ops.** The server already validates every op. There is no server change, no new event, no new collection, and nothing template-specific is stored: after insertion the nodes are ordinary nodes.
3. **Only the turn holder can add one**, through the existing `dispatch`. `selectCanEdit` is still the only gate.

No server file changes. No new dependency. No change to `/blog`, `/chat` or the dashboard.

Mark S31 In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/lib/canvasTemplates.js` | **New.** Template data and the pure builder |
| `src/collaborate/components/canvas/TemplatesDialog.jsx` | **New.** Dialog, cards and previews |
| `src/collaborate/components/canvas/ShapePanel.jsx` | Templates button, dialog state, the insert handler |
| `src/collaborate/components/canvas/EmptyCanvasHint.jsx` | One string |
| `test/canvasTemplates.test.mjs` | **New.** |
| `test/mobileA11y.test.mjs` | Only the assertions named in section 6 |
| `readme.md` | One feature bullet |
| `context/1-project-overview.md`, `context/2-architecture.md`, `context/3-ui-context.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md`, `context/specs/00-build-plan.md` | Documentation |

Everything else stays unchanged, including `Dialog.jsx`, `WorkspaceCanvas.jsx`, the store, and `server/**`. If the work seems to need another file, stop and record an open question in the tracker.

## 1. `lib/canvasTemplates.js`

Pure. It imports only from `@shared/canvasOps.js` (`createNodeId`, `createEdgeId`, `DEFAULT_NODE_SIZE`, `NODE_COLORS`, `MAX_OPS_PER_COMMIT`). No DOM, no store, no React.

### Data

```js
export const CANVAS_TEMPLATES = [ /* three frozen templates */ ];
// template = { id, name, description, nodes, edges }
// node     = { key, label, shape, color, x, y, width?, height? }   color is a NODE_COLORS name
// edge     = { from, to, sourceHandle, targetHandle }              from/to are node keys
```

`x` and `y` are the node's top-left corner in the template's own coordinates. A node without `width` and `height` uses `DEFAULT_NODE_SIZE[shape]`. Use exactly this data.

**`microservices` — "Microservices"**
Description: `An API gateway routes requests to separate services. The user and order services each own a database.`

| key | label | shape | color | x | y |
| --- | --- | --- | --- | --- | --- |
| gateway | API Gateway | rectangle | Blue | 330 | 0 |
| auth | Auth Service | pill | Purple | 0 | 188 |
| users | User Service | rectangle | Teal | 220 | 180 |
| orders | Order Service | rectangle | Orange | 440 | 180 |
| payments | Payment Service | rectangle | Pink | 660 | 180 |
| usersDb | User DB | cylinder | Neutral | 244 | 360 |
| ordersDb | Order DB | cylinder | Neutral | 464 | 360 |

Edges, all `bottom` → `top`: gateway→auth, gateway→users, gateway→orders, gateway→payments, users→usersDb, orders→ordersDb.

**`cicd-pipeline` — "CI/CD Pipeline"**
Description: `A commit moves through build, tests and packaging, then to staging, integration tests and production.`

| key | label | shape | color | x | y | width | height |
| --- | --- | --- | --- | --- | --- | --- | --- |
| source | Source Code | rectangle | Blue | 0 | 16 | | |
| build | Build | rectangle | Orange | 230 | 16 | | |
| test | Test Suite | diamond | Green | 460 | 0 | 176 | 112 |
| package | Package | rectangle | Blue | 706 | 16 | | |
| staging | Deploy Staging | rectangle | Orange | 936 | 16 | | |
| integration | Integration Tests | diamond | Purple | 1166 | 0 | 176 | 112 |
| production | Deploy Production | rectangle | Teal | 1412 | 16 | | |

Edges, all `right` → `left`: source→build, build→test, test→package, package→staging, staging→integration, integration→production.

**`event-driven` — "Event-Driven System"**
Description: `Producers publish events to a message broker. Consumers process them, an event store keeps a copy, and failures go to a dead letter queue.`

| key | label | shape | color | x | y |
| --- | --- | --- | --- | --- | --- |
| producerA | Producer A | rectangle | Blue | 0 | 60 |
| producerB | Producer B | rectangle | Blue | 0 | 220 |
| broker | Message Broker | hexagon | Orange | 270 | 132 |
| consumerA | Consumer A | rectangle | Green | 530 | 60 |
| consumerB | Consumer B | rectangle | Teal | 530 | 220 |
| store | Event Store | cylinder | Neutral | 286 | 320 |
| deadLetters | Dead Letter Queue | rectangle | Red | 790 | 140 |

Edges: producerA→broker, producerB→broker, broker→consumerA, broker→consumerB, consumerA→deadLetters, consumerB→deadLetters (all `right` → `left`), and broker→store (`bottom` → `top`).

### Functions

```js
export const TEMPLATE_GAP = 120;

export function templateBounds(template)
// → { x, y, width, height } of the template in its own coordinates, or null.

export function buildTemplateOps(template, existingNodes, viewCenter)
// → { ops, bounds } or null.
```

`buildTemplateOps`:

1. Return `null` when `template` is not one of the shapes above (not an object, no nodes array, an unknown shape or color name, an edge whose `from` or `to` is not a node key), when `existingNodes` is not an array, or when `viewCenter` does not have finite `x` and `y`.
2. **Placement.** Let `box` be `templateBounds(template)`.
   - Canvas empty (`existingNodes.length === 0`): the template's bounding box is centered on `viewCenter`.
   - Otherwise: compute the bounding box of `existingNodes` (each has `position`, `width`, `height`). The template is centered horizontally on that box's center and its top edge sits `TEMPLATE_GAP` below that box's bottom edge. `viewCenter` is not used.
   - Round every resulting node position to whole numbers with `Math.round`.
3. **Ops.** One `node.add` per template node, in order, then one `edge.add` per template edge, in order.
   - Node: `{ id: createNodeId(), type: "shape", position, width, height, data: { label, shape, color: pair.fill, textColor: pair.text } }`, with `pair` looked up in `NODE_COLORS` by name.
   - Edge: `{ id: createEdgeId(), source, target, sourceHandle, targetHandle, type: "link", data: { label: "" } }`, with `source` and `target` being the new node ids for `from` and `to`.
   - Every call creates fresh ids, so the same template can be added twice.
4. Return `null` if `ops.length > MAX_OPS_PER_COMMIT`.
5. `bounds` is the placed bounding box `{ x, y, width, height }` in canvas coordinates.

Inputs are never mutated. Limits (300 nodes, 600 edges, position range) are not checked here: `applyOps` inside `dispatch` already rejects the batch and toasts.

## 2. `components/canvas/TemplatesDialog.jsx`

Default export `TemplatesDialog({ open, onClose, onAdd })`. It uses the shared `components/ui/Dialog.jsx` unchanged, with `labelledBy` pointing at its title.

- Title (`text-2xl font-bold`): `Starter templates`.
- One line under it (`text-sm text-[var(--collab-muted)]`): `Adds the diagram to your canvas. Nothing is replaced, and Undo removes it.`
- A scrollable list (`max-h-[60vh] overflow-y-auto`, `space-y-4`) with one card per entry of `CANVAS_TEMPLATES`, in order. A card is `rounded-2xl border border-[var(--collab-border)] bg-[var(--collab-panel-2)]` and holds:
  - `TemplatePreview` (below),
  - the name in an `h3` (`text-base font-semibold`),
  - the description (`text-sm text-[var(--collab-muted)]`),
  - a button with the visible text `Add to canvas` and `aria-label={`Add ${template.name} template`}`, styled like the secondary buttons in `ProjectDialogs.jsx`. It calls `onAdd(template)`.
- A `Close` button at the bottom that calls `onClose`. Give it `data-autofocus` so the dialog does not open with focus on the first Add button.

**`TemplatePreview`** (a component in the same file): an `aria-hidden="true"` inline SVG with `viewBox="0 0 500 220"` and `preserveAspectRatio="xMidYMid meet"`, `w-full`. Scale and center `templateBounds(template)` into the viewBox with 16 units of padding. Draw each edge first as a straight `line` between the two node centers, then each node as: `ellipse` for circle, `polygon` for diamond and hexagon, `rect` with full rounding for pill, `rect` with a small radius for rectangle and cylinder. Node fill is the template color's `fill` from `NODE_COLORS`, applied through the `style` attribute like `ShapeNode` does. Strokes use `var(--collab-node-border-selected)` for nodes and `var(--collab-edge)` for edges. No labels, no markers, no raw hex in the component.

## 3. `ShapePanel.jsx`

- After the six shape items, add a thin divider (`aria-hidden`, like the one in `CanvasControls`) and a real `<button type="button">` with the lucide `LayoutTemplate` icon (`h-5 w-5`, `aria-hidden="true"`), `aria-label="Starter templates"`, `title="Starter templates"`, `aria-haspopup="dialog"`, `shrink-0`, and the same padding, hover and focus classes as the shape items. It is not draggable. Clicking it opens the dialog.
- Keep `open` in `useState`. Put a `ref` on the panel container.
- Render `<TemplatesDialog open={open} onClose={...} onAdd={addTemplate} />` inside a wrapper `<div className="contents" ...>` whose `onPointerDown`, `onPointerMove`, `onMouseDown`, `onClick`, `onDoubleClick`, `onKeyDown`, `onKeyUp`, `onDragOver` and `onDrop` handlers call only `event.stopPropagation()`. The dialog is portaled to `document.body`, but React still bubbles its events through this component to the canvas wrapper, which would otherwise publish cursor movement and react to keys while the dialog is open. Add a comment saying that.
- `addTemplate(template)`:
  1. Find the canvas with `panelRef.current?.closest(".react-flow")`; return if there is none. Its rect center, passed through `screenToFlowPosition`, is `viewCenter`.
  2. `const built = buildTemplateOps(template, useWorkspaceStore.getState().canvas.nodes, viewCenter)`; return if `null`.
  3. `if (dispatch(built.ops))`: close the dialog, then call React Flow's `fitBounds(built.bounds, { padding: 0.2, duration: 200 })` so the new diagram is in view. Get `fitBounds` from the existing `useReactFlow()` call.
  4. If `dispatch` returns `false` it has already shown its own toast (for example at the node limit); leave the dialog open.

The shape items, their drag code, `addShape` and `refuseDrop` are unchanged. The panel is still rendered only when `selectCanEdit` is true, so losing the turn unmounts the dialog with it.

## 4. `EmptyCanvasHint.jsx`

Change the holder text to: `Click a shape below to add it, drag one onto the canvas, or start from a template.` The other two texts and all markup stay.

## 5. Things that stay true

- Every canvas change goes through `dispatch`. One template is one dispatch, so it is one optimistic update, one commit, one `canvas:ops` broadcast and one undo frame. Undo removes the whole diagram.
- Nothing is sent to the server except the existing `canvas:commit`. The rate limit (20 commits per second) is not approached.
- No import from `src/chat/` or `src/blog/`; nothing outside `src/collaborate/` imports the new files.
- No raw hex and no Tailwind palette colors in components. Fill colors come from `NODE_COLORS`.
- No listener is added to `document` or `window`.

## 6. Tests

New `test/canvasTemplates.test.mjs`, built like `mobileA11y.test.mjs`: Vite in middleware mode with `hmr: false` and its **own port (24930)**, `ssrLoadModule`, `renderToStaticMarkup` from `test/ssrRender.js`. Copy helpers into the file. Load the real shared `canvasOps.js` through Vite so `applyOps` and `invertOps` are the production functions. At least:

**Data**

1. There are exactly three templates with ids `microservices`, `cicd-pipeline`, `event-driven`, in that order, each with a non-empty name and description, and the array and its contents are frozen.
2. Node and edge counts: 7 and 6, 7 and 6, 7 and 7.
3. Every node key is unique within its template; every shape is in `NODE_SHAPES`; every color is a `NODE_COLORS` name; every label is at most `NODE_LABEL_MAX`; every edge's `from` and `to` are node keys and differ; every handle is one of the four handle ids.
4. No two nodes of a template overlap (compare their rectangles using explicit or default sizes).

**Builder**

5. For each template, `buildTemplateOps(template, [], { x: 0, y: 0 })` returns ops that the real `applyOps` accepts on an empty canvas, producing the right node and edge counts, and `ops.length <= MAX_OPS_PER_COMMIT`.
6. Empty canvas: the placed bounding box is centered on `viewCenter` (within one unit, because of rounding), and `bounds` equals the box of the produced nodes.
7. Non-empty canvas: with one existing node at `(100, 100)` sized 160×80, the template's top edge is at `180 + TEMPLATE_GAP` and its horizontal center is at 180 (within one unit). `viewCenter` does not change the result.
8. Two builds of the same template share no node or edge id, and applying both to one canvas succeeds.
9. Round trip: applying a template's ops and then the `invertOps` result returns an empty canvas.
10. Node `color` and `textColor` are the `fill` and `text` of the named pair; edges have `type: "link"` and `data.label === ""`.
11. Returns `null` for: a non-object template, an unknown shape, an unknown color, an edge pointing at a missing key, a non-array `existingNodes`, a `viewCenter` with `NaN`. The template passed in is not mutated (pass frozen data).
12. A canvas already holding 295 nodes makes the real `applyOps` reject the built ops with its existing error, and nothing is partly applied.

**Markup**

13. `TemplatesDialog` (with the same `createPortal` rewrite `membershipUi.test.mjs` uses): the title, the three names in order, three buttons labelled `Add Microservices template`, `Add CI/CD Pipeline template`, `Add Event-Driven System template`, and a Close button. `open={false}` renders nothing.
14. Each preview is an `aria-hidden` SVG with one node element per template node and one `line` per edge.
15. `ShapePanel` inside a `ReactFlowProvider`: still six shape items, plus one `button` with `aria-label="Starter templates"` and `aria-haspopup="dialog"`.

**`test/mobileA11y.test.mjs`**: change only (a) the expected holder hint text, to the string in section 4, and (b) an assertion that counts the buttons or items in `ShapePanel`, if adding the Templates button makes it fail. List each changed line in the slice note.

The click that opens the dialog, the insert handler and `fitBounds` run in React handlers, which static markup does not execute. The builder tests cover the logic; the rest is on the manual checklist. Say so in the slice note.

## 7. Documentation

- `context/1-project-overview.md`: remove "Starter templates" from Out of Scope and add one line under Collaborative Canvas: three starter templates the turn holder can add to the canvas.
- `context/2-architecture.md`: add `canvasTemplates.js` to the lib line and `TemplatesDialog` to the canvas components line; one sentence that templates are client data inserted as ordinary ops in a single dispatch; checkpoint line.
- `context/3-ui-context.md`: a short `### S31` section: the Templates button in the shape panel, the dialog layout, add-not-replace, and `fitBounds` after insertion.
- `context/specs/00-build-plan.md`: mark S31 implemented in Phase L.
- `readme.md`: one bullet in Features, after the Undo and Redo bullet, in the list's format: **Starter Templates:** the turn holder can drop a ready-made Microservices, CI/CD Pipeline or Event-Driven diagram onto the canvas.
- Tracker and HANDOFF: status, slice note, what was not run.

## Verify when done

- [ ] `node --test test/canvasTemplates.test.mjs` passes. Report the count.
- [ ] Each of the twelve existing root suites passes in its own command. Report each count (baseline 293). Changed `mobileA11y` assertions are listed.
- [ ] `cd server && npm test` still passes 328.
- [ ] `npm run build` passes with no new warnings. Report the entry, `Collaborate` and `WorkspacePage` chunk sizes; the entry chunk must not grow.
- [ ] `git diff --check` passes, and `git diff --stat` shows only this spec's allowed files on top of anything earlier slices left uncommitted.
- [ ] `canvasTemplates.js` imports only from `@shared/canvasOps.js`.
- [ ] No raw hex in the two changed or new components.

**Manual checklist.** Record each line as passed or **not run**. Do not create live projects to satisfy it.

- [ ] As the holder on an empty canvas: each template lands centered and the view fits it.
- [ ] On a canvas with content: the template lands below the existing diagram, nothing is moved or removed, and the view moves to it.
- [ ] One Undo removes the whole template; Redo brings it back; a watcher's canvas matches after each step.
- [ ] Labels fit inside every shape, including both diamonds in CI/CD Pipeline.
- [ ] Adding the same template twice works.
- [ ] A watcher and a viewer see no Templates button.
- [ ] While the dialog is open, moving the mouse over it does not move this user's cursor on other screens, and typing does not trigger canvas shortcuts.
- [ ] At 320px wide the shape panel still fits or scrolls, and the dialog scrolls.

## Review checklist (for the reviewer)

Rerun every command above yourself. Then check:

1. The three templates match section 1's tables exactly: keys, labels, shapes, colors, coordinates, sizes, edges and handles.
2. `buildTemplateOps` is pure, never mutates its inputs, and follows the placement rules.
3. The only way a template reaches the canvas is one `dispatch(ops)` call. No store, socket or server file changed.
4. The Templates button and dialog exist only inside `ShapePanel`, which is rendered only for the holder.
5. The wrapper around the dialog stops propagation and nothing else; `Dialog.jsx` is unchanged.
6. The shape items and their drag code are byte-identical apart from the additions.
7. Only the named `mobileA11y` assertions changed.
8. The slice note claims no browser check that was not run.
