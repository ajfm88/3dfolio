# Slice 16: Drag and resize previews

**Lane:** both · **Depends on:** S15 (Approved or Committed) · **Unblocks:** S20

**Implementer:** Nemotron 3 Ultra · **Reviewer:** Grok

## Goal, baseline, and stopping point

While one editor drags or resizes a node, other joined clients see that node move on the display. When the gesture commits, the node lands on the saved position and size. A preview that is not followed by a commit disappears after 3 seconds. Previews never change the canonical graph, the version, or the database.

Read AGENTS.md, all six context files, this spec, and the S10 gesture code plus the S14–S15 join, commit, and recovery code. Grok fills the review role called Claude in older workflow text. HEAD when authored is `5d0340e`. S14 and S15 are approved and uncommitted in the working tree. Preserve that work, its tests, and the supplied planning documents. Capture the starting diff so S16 changes stay separate. If the user commits before implementation, use that newer baseline. A commit is not required to begin.

Set S16 In progress when starting. Implement this slice only, run the verification, mark Ready for review with evidence, and stop for Grok. No commits, pushes, branches, or S17 planning/implementation. Do not add cursors, presence, turns, undo/redo, invitations, chat, export, rate limits, or a new visual component. Owners and editors may still preview and commit at the same time until S20. Do not merge concurrent edits.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/lib/throttle.js` | New pure throttle with cancel and an injectable clock |
| `src/collaborate/lib/canvasPreview.js` | New preview overlay controller: sanitize, apply, expire, clear |
| `src/collaborate/store/useWorkspaceStore.js` | Wire emit, receive, throttle, and overlay clearing to the existing binding |
| `src/collaborate/components/canvas/WorkspaceCanvas.jsx` | Forward `onNodeDrag` to the store |
| `src/collaborate/components/canvas/ShapeNode.jsx` | Forward NodeResizer `onResize` to the store |
| `server/src/sockets/workspace.socket.js` | Authorize and relay `canvas:preview` |
| `server/test/canvas.socket.test.js` | Relay, rejection, and no-write regressions |
| `test/canvasPreview.test.mjs` | Throttle, overlay, store emit/receive regressions |
| `server/readme.md` | Document the preview event beside the existing commit text |
| `context/6-progress-tracker.md` | Status, S16-only notes, verification, limitations |

No other production files, packages, configuration, shared-module exports, models, schemas, or environment edits. In particular preserve `canvasOps.js` and its export surface, `workspaceRooms.js`, `useSessionStore.js`, `WorkspacePage.jsx`, `LinkEdge.jsx`, and the S15 sync helper's recovery rules. The architecture preview paragraph is already the planning contract. Update it only if implementation forces a real behavior change, and call that out. If a blocker requires another file, record it and stop before expanding scope.

## Wire

Client to server, no acknowledgement:

`socket.volatile.emit("canvas:preview", { projectId, nodes })`

`nodes` is `[{ id, position, width?, height? }]`. `position` is `{ x, y }`. Width and height are either both present or both absent. Do not send `userId`, `tabId`, `by`, `role`, `data`, `selected`, `measured`, `dragging`, `resizing`, or `markerEnd`.

Server to every other socket in the project room:

`socket.to(room).volatile.emit("canvas:preview", { projectId, by, nodes })`

`by` is the authenticated Mongo userId string. `socket.to` already excludes the sender. Do not use `io.to(room).except`, a per-user room, or a global emit. The relay is volatile. Commit broadcasts stay non-volatile.

There is no ack. Do not call a callback if one is present. Do not add a version, sequence, or timestamp to the payload. The architecture table is the wire shape.

## Server

Handle `canvas:preview` through `safeHandler`. Authorize with the same completed-join authority as commit: `joinedConnection` must match the current `joinedGeneration`, the socket must still be in `project:<id>`, and `canWrite(room, connection)` must pass. A viewer, an outsider, a socket that is not joined, and a connection whose join was invalidated by leave, rejoin, or disconnect are dropped.

Do this check synchronously. Do not enter the room write queue, retain a lease, call `findProjectForMember`, read or write the Canvas model, bump a version, or emit `canvas:ops`. A downgraded member can still preview until S27 refreshes membership. That is the same cached role commit used to have before its database refresh. Do not add the refresh here.

Validate the payload before relaying. Drop the whole payload on any failure. Drop means no emit, no throw, and no ack.

- `projectId` is a 24-character hex id, matched case-insensitively, and it is the socket's active joined project.
- `nodes` is an array of 1 to 50 plain objects.
- Each `id` matches shared `ID_PATTERN`. Ids in one payload are unique.
- `position.x` and `position.y` are finite numbers inside shared `POSITION_MAX`.
- `width` and `height` are both absent, or both finite numbers inside shared `NODE_SIZE_MIN` and `NODE_SIZE_MAX`.
- Any other field is stripped. The relayed entry is only `id`, `position`, and, when present, `width` and `height`.

An empty list after validation emits nothing. Fifty-one entries, a duplicate id, a non-finite number, a partial size, and an unknown extra field that makes the entry not a plain object all drop the payload. A well-formed id that is not on the canvas is still relayed. Clients ignore ids they do not have.

Add regressions to `server/test/canvas.socket.test.js` with the existing fake io. Cover: an editor's valid drag relay is volatile, excludes the sender, and sets `by` to the authenticated user id; the same user's second socket receives it; a viewer, a non-member, a bad project id, a payload over 50, a duplicate id, a non-finite coordinate, and a width without a height emit nothing; leave and the delayed same-project rejoin invalidate authority before queued detach, and a preview in that window emits nothing; `Canvas.updateOne` and the commit broadcast path are not used. Existing commit tests stay green, including the assertion that commit broadcasts are not volatile.

## Throttle

`throttle(fn, wait, clock)` returns a function with `cancel()`. `wait` is 50. The default clock is `Date.now`, `setTimeout`, and `clearTimeout`. Tests pass a fake clock and must not wait 50ms or 3s of real time.

The first call in a quiet window runs immediately. Later calls inside the window keep only the newest arguments and run once when the window ends. `cancel()` drops that pending call and does not invoke `fn`. One throttle serves both drag and resize samples for the current binding. A newer sample replaces the pending one. Cancel the throttle when the gesture ends, when the binding is disposed, and when the socket disconnects, before any commit emit for that gesture. A trailing sample must not leave after `commitNodePositions` or `commitNodeResize`.

## Client send

`WorkspaceCanvas` passes React Flow's `onNodeDrag` node list to the store. `ShapeNode` passes NodeResizer `onResize` params (`x`, `y`, `width`, `height`) to the store. Keep `onNodeDragStop` on `commitNodePositions` and `onResizeEnd` on `commitNodeResize`. Those paths still dispatch one canonical update and still refuse a no-op.

The store sends only while `selectCanEdit` is true for the current state. A viewer, a disconnected socket, a join still in progress, and a recovery (`syncStatus === "syncing"`) send nothing. Do not queue a preview for later.

A drag sample lists the gesture's nodes that exist in the canonical canvas, with `id` and `position` only. A resize sample lists that one node with `id`, `position`, `width`, and `height`. Skip a sample whose sanitized list is empty. Skip a sample of more than 50 nodes instead of truncating it. The local drag and resize display stays on the existing `onNodesChange` path. The sender does not apply its own preview.

Emit with `socket.volatile.emit` only while that socket is connected and its id is the binding's joined connection id. A disconnected socket does not buffer the event.

## Client receive

Register one `canvas:preview` listener on the current binding and remove that exact function on disposal. Use the same socket object, socket id, project, and join generation rules as `canvas:ops`. Ignore a non-record, a different project, and an event that arrives while the workspace is not `ready` or while `syncStatus` is `syncing`. Do not ignore an event because `by` equals the local user id. The sender's other tab must still see the preview.

Sanitize with the same rules as the server. A bad payload is ignored. An id missing from the canonical canvas is skipped. Apply the rest to `rfNodes` only.

Keep overlays outside the canonical `canvas`. Rebuilding display nodes from canonical must reapply the active overlays afterward, so a label update does not wipe another node's in-progress move. An overlay stores `id`, `position`, optional `width` and `height`, and the time of the last accepted sample.

Applying an overlay sets that display node's position. When the overlay has a size, also set `width`, `height`, and `measured` to that size. Preserve `selected`. Do not set `dragging` or `resizing`. Do not change `canvas.nodes`, `canvas.edges`, `canvas.version`, or the commit queue, and do not call `applyOps` or `dispatch`.

Clear one node's overlay when a canonical `node.update` changes that node's position or size, when that node is removed, and 3000ms after its last preview sample. A label-only or color-only update keeps the overlay. A newer preview replaces the overlay and restarts that node's 3000ms timer. Joining, installing a sync snapshot, starting recovery, disconnecting, retrying, and disposing the binding clear every overlay and cancel the throttle. One timer sweep is enough. Do not poll.

A preview already on the wire can arrive after the commit. Applying it may move the display until the next canonical update or until the 3s timer. Do not add a sequence field to fix that.

Until S20, two editors can preview the same node. The newest accepted sample wins. Do not merge.

## Verification

- [ ] Throttle: the first call runs immediately, calls inside 50ms collapse to the newest arguments, the trailing call runs once, and `cancel()` prevents it.
- [ ] Drag samples emit `{ projectId, nodes: [{ id, position }] }` at the throttled rate. Resize samples include `width` and `height`. No sample contains display fields. A gesture larger than 50 nodes emits nothing.
- [ ] Drag end and resize end cancel the pending sample and still commit one canonical op. A no-op gesture emits no commit. Select, measurement, pan, and shape-drag ghost work do not emit `canvas:preview`.
- [ ] A viewer and a client in recovery do not emit. An incoming preview during recovery does not change display or canonical state.
- [ ] A remote preview moves `rfNodes` and leaves `canvas` and the version unchanged. Selection survives. An unknown id is skipped. The same user's other tab is not filtered out.
- [ ] A second sample restarts the 3s timer. When the fake clock passes 3s without a sample, that node returns to the canonical position and size. A position commit clears that overlay immediately. A label commit does not.
- [ ] Server tests cover the relay and the drop cases above, with zero canvas writes. Commit tests still require a non-volatile broadcast.
- [ ] `node --test test/canvasPreview.test.mjs` and `node --test test/workspaceSync.test.mjs` pass from the repo root. `cd server && npm test` passes, with the previous 141 tests still passing. Root `npm run build` passes. `git diff --check` passes. Record counts, the workspace bundle size, and warnings.
- [ ] Browser: if two signed-in sessions are available, drag and resize in one and watch the other, then release and confirm the committed geometry. Also confirm a stopped drag with no commit returns after 3s. If that walk is not possible, say so. Do not write a live database fixture for a preview check. Previews must not create or update canvas documents.
- [ ] Update `server/readme.md` in the workspace realtime section: preview shape, volatile relay, no ack, no persistence, 3s client expiry, and the note that turn-holding is still S20. Leave historical S13–S15 notes intact.
- [ ] Mark Ready for review and stop for Grok. Do not mark Approved, commit, push, branch, or start S17.

## Done when

A watcher sees another editor's node glide during drag and resize and land on the committed position and size. A preview with no commit is gone within 3s, and the canonical node is unchanged. The database is never written by a preview.
