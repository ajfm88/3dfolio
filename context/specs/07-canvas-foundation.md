# Slice 07: Canvas foundation

**Lane:** client · **Depends on:** S05, S06 · **Unblocks:** S08

## Goal

Opening a project shows a real workspace: a navbar with the project's name and your role, and a full-height React Flow canvas you can pan and zoom. Every future canvas change has one entry point, the workspace store's `dispatch(ops)`, which applies ops with the same shared `applyOps` the server will use.

The canvas is **local only** in this slice. It starts empty on every load, and nothing is saved or sent. S13 loads the stored canvas and S15 syncs it. There's also no way to add a node yet (S08), and nodes render with React Flow's fallback until S09.

## Design

```text
package.json, package-lock.json        ← edit: add @xyflow/react (npm i)
vite.config.js                         ← edit: @shared alias
src/pages/Collaborate.jsx              ← edit: lazy WorkspacePage
src/collaborate/
├── collaborate.css                    ← edit: React Flow theme variables
├── store/
│   └── useWorkspaceStore.js           ← new
├── routes/
│   └── WorkspacePage.jsx              ← rewrite (was a placeholder)
└── components/
    ├── ui/
    │   └── RoleBadge.jsx              ← new (extracted from ProjectCard)
    ├── projects/
    │   └── ProjectCard.jsx            ← edit: use RoleBadge
    ├── workspace/
    │   └── WorkspaceNavbar.jsx        ← new
    └── canvas/
        ├── WorkspaceCanvas.jsx        ← new
        └── CanvasControls.jsx         ← new
```

No server change. No socket use: the store doesn't touch `useSessionStore`'s socket until S13.

### Layout

```text
┌──────────────────────────────────────────────────────────┐
│ ← Projects   Project name                       [editor] │  h-14 navbar
├──────────────────────────────────────────────────────────┤
│ · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·│
│ · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·│  canvas, flex-1
│ · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·│  dot background
│ ( + − ⛶ )                                                │  CanvasControls,
└──────────────────────────────────────────────────────────┘  bottom left
```

`h-[100dvh]`, a column: the navbar, then a `relative flex-1 min-h-0` main area that the canvas fills. The chat panel column (S24) and the turn bar (S21) come later; don't leave placeholders for them.

### Workspace states

| State | When | Shows |
| --- | --- | --- |
| `loading` | `GET /api/projects/:id` in flight | the same spinner as `CollaborateLoader`, centered in the viewport |
| `ready` | `200` | navbar + canvas |
| `notFound` | `404` (not a member, deleted, or a bad id) | a centered card: eyebrow `Collaborate`, title `Project not found`, line `It may have been deleted, or you don't have access.`, and a primary button **Back to projects** linking to `/collaborate` |
| `error` | any other failure | a centered card: title `We couldn't open this project`, line `Check your connection and try again.`, and a **Try again** button that reloads |

The cards copy `SessionErrorCard`'s classes in `Collaborate.jsx`. No toast for load failures; the card is the message. S29 polishes these states, so keep them plain.

## Implementation

### Dependency and alias

- `npm i @xyflow/react` at the root, saving `^12` (12.12.1 at spec time). npm 7+ may also add `@types/react` and `@types/react-dom` to the lockfile as peer dependencies. That's expected; don't add them to `package.json` yourself. Record what changed in the lockfile in the slice note.
- `vite.config.js`:

  ```js
  import { fileURLToPath, URL } from "node:url";
  // ...
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./server/src/shared", import.meta.url)),
    },
  },
  ```

  Add one comment in the repo's voice: the client imports the server's pure canvas module through this alias so both sides run the same validation, and the import only goes client → server (Render builds `server/` alone). Change nothing else in the config.

### `src/pages/Collaborate.jsx` (edit)

- Load `WorkspacePage` with `React.lazy`, so React Flow (≈150 kB) is downloaded only when a project is opened, not on the dashboard.
- Wrap the `Routes` in `<Suspense fallback={<CollaborateLoader />}>`.
- Add a short comment saying why. Change nothing else.

### `src/collaborate/store/useWorkspaceStore.js` (new)

Imports: `create` from zustand, `toast`, `applyNodeChanges` and `applyEdgeChanges` from `@xyflow/react`, `axiosInstance`, and `applyOps` from `@shared/canvasOps.js`. Nothing from `src/chat/` or `src/blog/`.

**State**

```js
{
  status: "idle" | "loading" | "ready" | "notFound" | "error",
  project: null,          // the Detail object from GET /api/projects/:id
  role: null,             // "owner" | "editor" | "viewer"
  canvas: { nodes: [], edges: [], version: 0 },   // canonical: only canvasOps output goes here
  rfNodes: [],            // React Flow display arrays, rebuilt from canonical
  rfEdges: [],
}
```

Export a selector helper `selectCanEdit = (s) => s.role === "owner" || s.role === "editor"`. From S20 this becomes "and holds the turn", and a single helper keeps that change in one place. Say so in a comment.

**`loadWorkspace(projectId)`**

- A module-level request counter, the same latest-wins pattern as `useProjectsStore`'s `listRequest`. Only the latest call may write state.
- Start by resetting everything to the initial state with `status: "loading"`. The store outlives the route, so a previous project's canvas must never flash.
- `GET /projects/:id`. On `200`, set `project`, `role`, `status: "ready"`, and an **empty** canvas `{ nodes: [], edges: [], version: 0 }` with empty display arrays. Comment: the stored canvas arrives with `workspace:join` in S13.
- On `404`, set `status: "notFound"`. Otherwise `status: "error"`.

**`resetWorkspace()`**: bump the request counter, so an in-flight load can't land, and return to the initial state (`status: "idle"`).

**`dispatch(ops)`** → `boolean`. **The only way canvas content changes** (invariant 4).

1. If `!selectCanEdit(get())`, return `false` and apply nothing. Comment: the server is the real gate from S14; this keeps a viewer's UI from showing edits that would be rejected.
2. `const result = applyOps(canvas, ops)`.
3. On `ok: false`, `toast.error(result.error)` and return `false`. State is untouched.
4. On `ok: true`, set `canvas` to `{ nodes: result.canvas.nodes, edges: result.canvas.edges, version: canvas.version }` and rebuild both display arrays (below). `version` is unchanged; S15 sets it from commit acks. Return `true`.

There's no queue, no socket, and no commit yet. Don't add stubs for them.

**Display rebuild** (private functions, module scope)

- `toDisplayNodes(nodes, previous)`: index `previous` by id with a `Map`. For each canonical node return a **new** object: `{ id, type, position: { x, y }, width, height, data: { ...data }, selected, measured }`, where `selected` is the previous display node's `selected` (default `false`) and `measured` is its `measured` (omit the key when there's none). Never put the canonical object itself into the display array; React Flow writes onto display nodes.
- `toDisplayEdges(edges, previous)`: the same, keeping only `selected`.
- The comment explains why: React Flow owns `selected` and `measured`, and a rebuild that dropped them would deselect nodes and force a re-measure on every edit.

**`onNodesChange(changes)` / `onEdgesChange(changes)`**

- Keep only changes whose `type` is `select`, `position`, or `dimensions` (edges: `select` only). Apply them to `rfNodes` / `rfEdges` with `applyNodeChanges` / `applyEdgeChanges`. They **never** touch `canvas`.
- Drop every other type, including `remove`, `add`, and `replace`. Comment why: deletes become ops through `onDelete` in S10, so applying `remove` here would delete twice, and nothing outside `dispatch` may add content.

### `src/collaborate/components/ui/RoleBadge.jsx` (new) and `ProjectCard.jsx` (edit)

Move the `BADGES` map and the badge `<span>` out of `ProjectCard` into `RoleBadge({ role })`, unchanged in classes and output (capitalized role, viewer styling as the fallback). `ProjectCard` renders `<RoleBadge role={project.role} />` in the same spot. Nothing else in `ProjectCard` changes; the dashboard must look identical.

### `src/collaborate/routes/WorkspacePage.jsx` (rewrite)

- Reads `projectId` from the route. An effect calls `loadWorkspace(projectId)` when `projectId` changes and `resetWorkspace()` in its cleanup.
- Renders by `status`, per the Workspace states table. `idle` renders the loader too (the first render, before the effect runs).
- `ready`: `h-[100dvh] flex flex-col`, `<WorkspaceNavbar />`, then `<main className="relative min-h-0 flex-1">` holding `<WorkspaceCanvas />`.
- Reads store state through selectors only. It doesn't call `axios`.

### `src/collaborate/components/workspace/WorkspaceNavbar.jsx` (new)

- `h-14`, `bg-[var(--collab-panel)]`, a bottom border with `--collab-border`, horizontal padding `px-4`.
- Left: a back link to `/collaborate` (lucide `ArrowLeft` `h-4 w-4` plus `Projects`, styled like the current placeholder's link), a thin divider, then the project name (`text-base font-semibold`, `truncate`, `title` attribute with the full name).
- Right: `<RoleBadge role={role} />`.
- The right side is where the participant stack, Share, and the chat toggle go later. Don't render placeholders for them.

### `src/collaborate/components/canvas/WorkspaceCanvas.jsx` (new)

- Imports `@xyflow/react/dist/style.css` here, inside the lazy chunk (invariant 8).
- Module-level constants: `const nodeTypes = {};` and `const edgeTypes = {};`. Comment: React Flow re-creates every node when these objects change identity, so they must live at module scope; `ShapeNode` (S09) and `LinkEdge` (S12) are registered here. Until then React Flow uses its fallback types and logs a missing-type warning for nodes. That's expected in S07–S08.
- Wraps its content in `ReactFlowProvider`, so `CanvasControls` can call `useReactFlow`.
- `<ReactFlow>` props:
  - `nodes={rfNodes}`, `edges={rfEdges}`, `onNodesChange`, `onEdgesChange`, `nodeTypes`, `edgeTypes`
  - `colorMode="dark"`
  - `minZoom={0.2}`, `maxZoom={2}`
  - **no `fitView` prop.** Whether to fit when S13 loads a stored canvas is S13's call. The viewport never moves on its own when content changes.
  - Read-only for viewers (`canEdit` from `selectCanEdit`): `nodesDraggable={canEdit}`, `nodesConnectable={canEdit}`, and `deleteKeyCode={canEdit ? "Backspace" : null}`. Selection stays on for everyone. Panning and zooming work for everyone.
- Children: `<Background variant={BackgroundVariant.Dots} gap={20} size={1} />` and `<CanvasControls />`.
- Keep React Flow's attribution link (the default). Don't set `proOptions`.

### `src/collaborate/components/canvas/CanvasControls.jsx` (new)

- Bottom left, floating: `absolute bottom-4 left-4 z-10`, a glass pill (`rounded-full`, `--collab-glass` background, `--collab-border` border, `backdrop-blur`), like the other floating toolbars in `3-ui-context.md`.
- Three icon buttons: zoom in (`Plus`), zoom out (`Minus`), fit (`Maximize`). Each calls `useReactFlow()`'s `zoomIn`, `zoomOut`, or `fitView` with `{ duration: 200 }`. Icons are `h-5 w-5`, every button has an `aria-label` (`Zoom in`, `Zoom out`, `Fit to screen`), and `rounded-full` hover states use the tokens.
- Don't use React Flow's built-in `<Controls>`; its look doesn't match the theme. Undo and redo join this pill in S25.

### `src/collaborate/collaborate.css` (edit)

- Map React Flow's v12 CSS variables to the collab tokens under `.collab-root .react-flow`: the canvas background (`--collab-bg`), the dot color (`--collab-border-strong` or similar, readable but quiet), and the attribution panel background and text. Read the exact variable names from `node_modules/@xyflow/react/dist/style.css`; don't guess. Only `var(--collab-*)` values, no raw hex.
- Nothing else in the file changes.

## Dependencies

- `@xyflow/react` ^12, the only new dependency allowed by `4-code-standards.md`.
- The shared module's ids use `crypto.randomUUID()`, which browsers expose only in secure contexts (HTTPS or `localhost`). Testing from another device over plain `http://<LAN-IP>` would break id creation from S08 on. Note that in the slice note.

## Verify when done

- [ ] `npm run build` passes. React Flow and the workspace code are in a **separate chunk** from both the entry chunk and the dashboard's Collaborate chunk (name the chunks and sizes in the slice note). The entry chunk is the same size as after S06.
- [ ] Signed in as the owner, opening a project from the dashboard shows the navbar (name, `owner` badge) and a full-height dot canvas. Drag-panning and wheel-zooming work, and the three control buttons zoom in, zoom out, and fit.
- [ ] The page has no outer scrollbar on a desktop window or a phone-sized window in DevTools.
- [ ] `/collaborate/<random 24-hex id>` and `/collaborate/not-an-id` both show **Project not found**, and its button returns to the dashboard.
- [ ] Stopping the API server and opening a project shows the error card. **Try again** recovers after the server restarts.
- [ ] Navigating project A → dashboard → project B never shows A's name, even briefly (throttle the network in DevTools to check).
- [ ] `dispatch` works end to end, checked from a **temporary** hook removed before review (e.g., assigning the store to `window` in dev): a valid `node.add` shows a node (fallback rendering is fine) and returns `true`, an invalid op toasts the shared module's message and changes nothing, and a `node.update` keeps the node selected. As a viewer, `dispatch` returns `false` and nothing changes. Write down what you ran. `git diff` must show no trace of the hook.
- [ ] As a viewer (set a member's role in the database, or use a second account added through the database, and clean up afterward per Q2), nodes can't be dragged and Backspace deletes nothing.
- [ ] The dashboard looks identical: role badges render exactly as before.
- [ ] `grep` shows nothing outside `src/pages/Collaborate.jsx` imports from `src/collaborate/`, nothing in `src/collaborate/` imports from `src/chat/` or `src/blog/`, and `@xyflow/react` is imported only inside `src/collaborate/`.
- [ ] `cd server && npm test` still passes (no server change).
- [ ] `/blog` loads posts, and `/chat` sends a DM.
- [ ] `git diff` touches only the files under Design, plus the tracker.
- [ ] The tracker notes that the canvas is local-only and empty on every load until S13/S15, and S07 is **Ready for review** with its slice note.
