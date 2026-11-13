# Slice 25 — Undo and redo for the turn holder

**Execution status (2026-11-12): Approved after second correction, uncommitted on `9b47c77`.** See `25-undo-redo-review.md` for final evidence and accepted corrections. The planning baseline and instructions below remain the original implementation contract; they are not the current progress status. HANDOFF.md records today's stop after S26; do not start further slice work.

**Lane** both (shared pure module and client; no server handlers) · **Depends on** S22 (Committed) · **Next** S26

**Spec author / reviewer** Codex · **Implementer** Claude Sonnet, assigned by the user on 2026-11-12

## Baseline and scope

Read AGENTS.md and its six context files in order, HANDOFF.md, this spec, and the final S23/S24 reviews. Planning baseline: clean HEAD `9b47c77` (commit 68), which commits S23/S24. Record the actual implementation baseline and preserve any later user changes. Earlier notes describing S23/S24 as uncommitted are historical.

Add this tab's canvas undo/redo, inverse-op semantics, controls and keyboard shortcuts. Preserve existing optimistic edits, serial server commits, reconnect recovery, turn enforcement, presence, previews, and project chat. Mark S25 In progress before coding. Finish this slice, verify, mark Ready for review, and stop for Codex. Never commit, push, branch, deploy, start S26, or touch the drawDB track.

This is an implementation plan, not a statement that S25 already exists. No application code or test was changed or run during planning.

## Allowed files

| File | Work |
| --- | --- |
| `server/src/shared/canvasOps.js` | Add pure `invertOps`; reuse existing validation and semantics |
| `server/test/canvasOps.test.js` | Inverse coverage and expected export-list addition |
| `src/collaborate/lib/canvasHistory.js` | New local history, replay preparation, graph comparison and chunk helpers |
| `src/collaborate/lib/canvasShortcuts.js` | New testable shortcut classification/handling helpers |
| `src/collaborate/lib/workspaceSync.js` | Narrow history invalidation/settlement notifications, reactive pending state, and atomic enqueue of ordered replay chunks |
| `src/collaborate/store/useWorkspaceStore.js` | Binding-owned history, selectors/actions, lifecycle cleanup, replay through the existing op pipeline |
| `src/collaborate/components/canvas/CanvasControls.jsx` | Undo/redo buttons and replay status |
| `src/collaborate/components/canvas/WorkspaceCanvas.jsx` | Scoped keyboard handling and drag/connection interaction tracking if needed |
| `src/collaborate/components/canvas/ShapeNode.jsx` | Only resize interaction start/end tracking if display flags cannot reliably gate history |
| `src/collaborate/collaborate.css` | Only scoped focus/disabled/status styles if utilities do not suffice |
| `test/canvasHistory.test.mjs` | New production-store/sync/history regression suite |
| `test/canvasShortcuts.test.mjs` | New shortcut, control, event wiring and cleanup coverage |
| `test/workspaceSync.test.mjs`, `test/turnRobustness.test.mjs` | Add focused history lifecycle regressions if useful; retain existing assertions |
| `context/2-architecture.md`, `context/3-ui-context.md`, `context/4-code-standards.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md` | Document implemented behavior, new suites, evidence and handoff |

Do not add dependencies or change manifests, configuration, environment files, server socket/controller/model code, protocol, limits, project chat files, session/auth store, other routes, or upstream reference projects. Do not weaken old tests to accommodate regressions. Test scaffolding should live in the named new suites; use the existing Vite SSR/fake-socket/mounted-effects patterns without editing shared harness files.

## 1. Pure inverse semantics

Export `invertOps(canvas, ops)` from the shared module. It has no imports, I/O, clock, random ids, persistence, or input mutation. Its input canvas is the canonical pre-operation graph (the same contract as applyOps). Validate the entire forward batch with existing applyOps semantics before returning success; do not normalize away invalid operations or create an independent permissive validator.

- Success: `{ ok: true, ops: inverseOps }`.
- Failure: `{ ok: false, error, index }`, matching applyOps' validation failure and index for that forward batch. No partial inverse is returned.
- Forward input remains 1–50 ops. **Output may exceed 50 ops.** It is a logical sequence to replay in chunks, not a newly enlarged commit envelope. Leave applyOps and MAX_OPS_PER_COMMIT unchanged.

Use each normalized forward op's immediate pre-state. Reverse the order of the per-op inverse groups, keeping each group's internal dependencies intact:

| Forward op | Inverse group |
| --- | --- |
| node.add | node.remove with the same id |
| node.update | node.update restoring the previous values of exactly the normalized patched fields (including nested data fields) |
| node.remove | node.add with the full previous canonical node, then edge.add for every edge that this removal actually cascaded |
| edge.add | edge.remove with the same id |
| edge.update | edge.update restoring the previous label |
| edge.remove | edge.add with the full previous canonical edge |

Nodes must exist before edges are restored. If two removed nodes shared an edge, the edge belongs only to the removal that actually deleted it; reverse group order then restores both endpoints in time. Self-loops are restored once. Preserve ids, handle ids, labels, positions, sizes, shape and colors. Ignore display fields. Use Map/Set or equivalent safe membership for ids such as `__proto__` and `constructor`. Returned objects must not alias mutable caller objects.

Repeated updates, add/update/remove, remove/re-add of the same id, update/remove of an edge, and edge add followed by a cascaded removal all use intermediate states. Do not globally move all node.add ops to the front: that breaks id reuse and dependencies. An inverse can be longer than its forward batch even when the final graph is small.

The round-trip contract is **canonical graph equivalence by id and fields**. Versions increase through real commits; node/edge array ordering and z-order restoration are not promised. Helpers/tests must not compare versions or require the original insertion order. The original op validation, atomic failure, 300-node/600-edge limits, and output whitelist remain unchanged.

## 2. History units, ownership and availability

History is memory-only and belongs to one project/tab/account/authenticated connection/join epoch. Use detached normalized `{ forward, inverse }` frames, not whole canvas snapshots or React Flow objects. Keep at most 100 undo frames, evicting the oldest after a successful new edit. This is a client memory policy; no server limit changes. Redo cannot grow beyond the retained history.

One successful, graph-changing public `dispatch(ops)` is one history frame, regardless of whether transport later combines it with another dispatch. Multi-node move/resize/delete keeps its existing dispatch boundary. No history for selection, measurements, viewport actions, previews, remote ops, hydration, rejected dispatches, or an accepted batch with no net graph change. A no-op must not clear redo. Preserve dispatch's boolean contract and existing no-op gesture helpers.

At a normal dispatch:

1. Check current write authority; validate forward ops and prepare the inverse against the current optimistic canonical canvas, before changing it.
2. If graph-changing, install the provisional frame and clear redo before enqueue can fail synchronously. Publish the optimistic canvas and busy state consistently, then use the existing sync queue. Frames remain unusable while saves are pending.
3. Only a fully drained, successful queue makes undo/redo available. Multiple provisional frames remain distinct even when saved in one transport commit. A rejection, uncertainty or recovery clears all frames; never infer which provisional frames persisted from an optimistic graph.

Export `selectCanUndo` and `selectCanRedo`, and store actions `undo()` / `redo()` returning false when unavailable. Availability requires all of: the current tab really holds the editing turn; the active session socket/account still owns the joined connection; workspace ready; no recovery; no in-flight or queued commits; no replay; the relevant stack nonempty; and no active node drag/resize/connection gesture. A stale render must not authorize an action: recheck inside each action. Do not consume native editing shortcuts while a field is focused.

New ordinary dispatches remain allowed while previous ordinary edits save, preserving current batching. While undo/redo replay runs, refuse all new ordinary canvas mutations and previews (including direct store calls and blur handlers), and make canvas editing affordances read-only. Selection/pan/zoom, cursors, turn controls and chat remain usable. Avoid deadlocking replay: separate the underlying holder/connection permission used by the internal sync pump from the UI/public-dispatch gate that additionally blocks editing during replay. Every replay chunk must still pass the underlying permission check. Never bypass server authority or gate chat with replay state.

Track pending/replay/interaction state reactively so controls disable immediately on enqueue and enable when the last ack settles. Do not rely solely on mutating hidden binding arrays that Zustand subscribers cannot observe. Interaction tracking must clear on cancellation/disposal/turn loss; merely panning/selecting is not an edit gesture. Existing display flags may be used if reliable; narrow explicit gesture tracking is allowed in the named canvas files. End a gesture before its final normal commit is dispatched.

## 3. Ordered replay and the 50-op limit

Only start replay from a settled queue. Undo selects the latest undo frame's inverse; redo selects the latest redo frame's original normalized forward sequence. Keep original ids. Do not call the public dispatch recursively to create new history frames, and do not accept a public flag that lets callers bypass write authority. Ordinary edits and replay must share the validated canonical-op/publish/enqueue path; components call store actions only.

Split the selected sequence into contiguous chunks of at most 50 ops without reordering, omitting, deduplicating, or changing limits. Preflight **every** chunk sequentially against a private copy of the current graph with applyOps. If any fails, publish/send nothing, clear stale history and show a concise failure. Do not salvage a subset or request an automatic retry.

On successful preflight, mark replay busy, retain the frame as a pending stack transition, and publish the fully optimistic replay graph at the last confirmed version. Enqueue all prepared chunks together before pumping the first one (a narrow enqueueMany-style helper is acceptable); never let a synchronous failure during the first emit leave later chunks orphaned. The existing single-in-flight pump sends them in order. Each next commit uses the preceding confirmed version. Each ack applies its sent ops to confirmed state exactly once, not again to the already optimistic graph. Notifications to watchers remain the server's existing persisted canvas:ops broadcasts; watchers can observe intermediate committed graphs.

Move the frame from undo to redo, or redo to undo, only after the final ack succeeds and that same replay epoch is fully drained. Repeated button presses/held keys cannot start overlapping commands. Never generate inverse-of-inverse history during replay. A new graph-changing normal edit after undo clears redo. No-op/rejected edits and viewport actions do not.

**Interruption contract:** a logical replay spanning multiple commits is not atomic at the server. If a later chunk fails, times out, loses its turn, or disconnects, an already saved prefix can remain. Discard unsent chunks and both history stacks, retire replay callbacks, and use the existing authoritative recovery/rejoin path. Do not roll back saved chunks, retransmit uncertain chunks, or pretend the complete command succeeded. Keep existing error/reconnect/resync notices; for a current replay interrupted while the workspace remains visible, add at most one concise notice that some changes may have been saved (for example, `Undo interrupted. Some changes may have been saved.`). Do not toast after route/account disposal. If turn loss leaves only a chunk already in flight, retain the existing settlement/recovery behavior for that write; history must still stay cleared.

Required large case: remove a node incident to all 600 allowed edges (self-loops and parallel edges are valid). Undo restores 1 node + 600 edges in 13 commits, each at most 50 ops, with valid intermediate endpoints and monotonic versions. Redo removes it again. A single deletion must never become permanently non-undoable just because its inverse exceeds one commit.

## 4. Lifecycle and sync integration

Keep history lifecycle coordination explicit and narrow. Optional binding-scoped notifications in createSyncController for queue changes, a successful full drain, and invalidation/recovery are acceptable; add no history-specific wire events. Existing helper tests that supply dependencies without the optional notifications must keep working.

Clear undo/redo, pending replay transitions and interaction state on **every** turn loss (even with an empty queue), recovery start (including a rejection whose attached snapshot permits immediate recovery), disconnect, join/retry/rejoin, workspace error/notFound/reset, project change, disposal, sign-out, account change, or session socket replacement/removal. An authoritative snapshot never carries history. A later grant starts empty. Clean up exact subscriptions/listeners by reference, including under StrictMode.

Use a history generation plus existing binding/attempt/sync epoch/connection ownership checks or an equivalent scheme. Late ack, finally, timer or drain callbacks cannot restore cleared history, pop a newer frame, complete a retired replay, or send its next chunk. A connection/account replacement observed without a disconnect event must immediately disable/invalidate history. Reuse the existing connectionAccounts ownership mechanism; workspace retry cannot relabel the authenticated connection. Limit any new account checks in the sync pump to preventing old-account queued writes; do not rewrite auth/session infrastructure or change the protocol.

Remote canvas ops never create local history. A valid nonduplicate remote update invalidates any retained local history before applying it; an unexpected remote event during local pending work still triggers the existing recovery. Stale/duplicate versions and foreign-project traffic must not spuriously clear valid history. Existing sync snapshot floors, malformed-event recovery, buffered-packet removal, grace/rejoin behavior and pagehide release remain intact.

## 5. Controls and keyboard behavior

Extend the bottom-left CanvasControls glass pill with labelled Undo and Redo icon buttons using existing lucide icons/tokens. Leave zoom and fit controls intact. Undo/redo remain visible but disabled when unavailable, including for watchers/viewers. Add clear disabled styling, titles and aria-labels. During replay expose `Undoing…` / `Redoing…` in a small polite status region. No new modal, toolbar row, preference or persistence.

Bind shortcuts to the mounted canvas surface and its descendants, not document/window. Make the canvas surface keyboard-focusable with an accessible name and visible focus indicator. A pane pointer click may focus it, but must not steal focus from inputs, node/edge label editors, toolbar controls or chat. Scoping must work with React portals; logical bubbling from a portaled editable field does not authorize a canvas command. Clean up any effects/listeners exactly once on unmount.

- Undo: Ctrl+Z or Cmd+Z, without Shift or Alt.
- Redo: Ctrl+Shift+Z or Cmd+Shift+Z, or Ctrl+Y without Meta/Shift/Alt.
- Zoom: unmodified `+` or `=` zooms in; unmodified `-` zooms out. Shift needed to type `+` is allowed. Ctrl/Cmd +/-/= stays native browser zoom. Viewers can use canvas zoom shortcuts.
- Ignore defaultPrevented, composition (`isComposing`/native composing or keyCode 229), repeat, Alt combinations, and events from outside the focused canvas. Reject conflicting Ctrl+Meta chords.
- Skip inputs of any type, textarea, select, contenteditable (including inherited/empty attributes), role=textbox, and their descendants, checking event path/target and focused element as appropriate. Respect existing nokey label/composer boundaries. No changes to those editor components are needed.
- Handle keys in bubbling phase after editors can stop them. Only preventDefault/stopPropagation for an available command that is actually accepted; unavailable history commands do nothing. Do not intercept browser zoom, browser/page shortcuts, chat text undo, node/edge label text undo, IME or other routes.

All network/state work remains in stores/helpers. The shortcut adapter calls undo/redo actions and React Flow zoom methods; no socket/axios calls in components.

## 6. Required automated coverage

Use production shared helpers, stores, sync controller and event adapter, not a parallel implementation. Fake sockets should validate/apply each outgoing payload to an authoritative test graph and deliver controlled acks/remote events. Close every Vite instance, root, listener and timer. No real database, Clerk, ImageKit or extra dependency is required for automated tests.

**Shared inverses:** every op type and every node patch field; deep immutability and detached results; forward validation errors/index parity; normalization/whitelisting; repeated updates; add/update/remove; remove/re-add same ids; self-loops/parallel edges; two removed nodes sharing an edge; edge update/remove; edge add then cascade; safe special ids; no-op graph equivalence; 600-edge cascade. Apply large inverses in legal chunks, compare graphs by id/fields, and leave the existing strict export assertion intact except for adding invertOps.

**Store/sync history:** add → move → recolor → delete → undo four → redo four restores holder and watcher graphs, with legitimate versions; two or more dispatches coalesced into one transport commit undo separately; pending saves disable commands while ordinary edits still queue; redo clearing only on a new graph-changing edit; refused/invalid/no-op dispatches; 100-frame eviction; large undo's 13 sequential commits and redo; replay blocks normal canvas mutation/previews but not chat readiness/cursors/pan/zoom/turn controls; active gestures block replay; successful final ack alone moves stacks.

**Failure/lifecycle:** reject/timeout/throw before first ack and after a saved large-replay prefix; no automatic resend; recovery snapshot with preserved prefix and cleared stacks; turn loss with queued chunks, only in-flight work, and no pending work; later grant remains empty; immediate attached-snapshot recovery; disconnect/rejoin; retry on same socket; project A → B; null/replaced session socket; sign-out/account replacement on unchanged connection; stale ack/drain after invalidation and after a newer binding; foreign/duplicate remote events leave history alone while accepted remote changes clear it. Retain existing Socket.IO sendBuffer and S24 account/scroll regressions.

**Shortcut/UI suite:** recognized/rejected key matrix, target/focus and portal boundaries, composition/repeat/defaultPrevented, native browser zoom preservation, viewer zoom, real disabled button rendering and replay status, current store action revalidation, and mounted adapter/effect or DOM-event coverage proving the production handler is wired to the canvas and cleaned up. Pure classifier tests or source-text searches alone do not establish event wiring. Use the existing mounted-effects harness approach if a browser is unavailable; identify its limitations explicitly.

## 7. Verification and implementation sequence

Implement in this order: (1) pure inverses/tests; (2) history frames/preflight/chunks/tests; (3) sync lifecycle and replay/store tests; (4) controls/shortcuts/event coverage; (5) full regressions, docs and handoff. Keep a single slice and stop before membership work.

Run and record each command; run root suites **separately and sequentially**, since Vite harnesses can collide on port 24678:

```text
In server/: npm test
At root: node --test test/workspaceSync.test.mjs
At root: node --test test/canvasPreview.test.mjs
At root: node --test test/participants.test.mjs
At root: node --test test/cursorPresence.test.mjs
At root: node --test test/turnState.test.mjs
At root: node --test test/turnRobustness.test.mjs
At root: node --test test/projectChat.test.mjs
At root: node --test test/projectChatUi.test.mjs
At root: node --test test/canvasHistory.test.mjs
At root: node --test test/canvasShortcuts.test.mjs
At root: npm run build
At root: git diff --check
```

Last independent S24 baseline was 405 passing tests (221 server, 184 client), plus a passing build; this is historical evidence, not an S25 verification. New tests increase those counts. Explain failures and new warnings; do not silently skip coverage or change dependencies.

Follow the workflow's API boot/health and other-route checks when available. Existing local configuration can name the live MongoDB database: do not create members/projects or write live data merely to complete QA. Record whether API boot is independently checked or inherited evidence, and stop any process you start.

Manual walkthrough when two configured accounts/project access are available: holder add/move/recolor/delete and four undo/redo operations; watchers match after each settled command and reload; >50-edge restore and interrupt it by handing off/offline; second tab/viewer cannot replay; pan/zoom/selection remain usable; chat and both label editors retain native text undo and IME; Ctrl/Cmd browser zoom stays native; narrow screen controls remain usable. Check /blog and /chat regression behavior. Do not add temporary membership routes or edit live membership to unblock this walkthrough. Carry unavailable browser/two-account/live-media checks explicitly to S26/S28/S29/S30 as already documented; code approval is not launch readiness.

Update architecture/UI/standards to describe what actually shipped, not just this plan. In the tracker list changed files, test counts, build/diff results, each manual check or limitation, any deviations, and the actual baseline. Update HANDOFF.md for Codex review. Mark S25 Ready for review, summarize the interrupted-replay limitation, and stop. The reviewer will independently rerun tests/build and inspect the diff against this spec.
