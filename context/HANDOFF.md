# Session handoff — 2026-11-11

## Stop here today

The user ended work after S23 and S24. Both passed Codex code review and are **Approved, uncommitted**. HEAD at handoff is `43eb732` (commit 67). S01–S22 are committed. S25 has no spec and no implementation. Brief source inspection for S25 occurred before the user stopped work, but no design was finalized. This handoff is not an S25 spec or authorization to implement during the stopped session.

Grok implements; Codex writes specs and reviews, unless the user changes assignments. Never commit, push, create branches, or deploy; the user handles commits. No application code or data changed during the final documentation reconciliation.

## Start next session

1. Read AGENTS.md and the six context files it lists, then this handoff. Check git status/log: the user may have committed S23/S24 since this snapshot. Preserve all existing work and do not treat the large uncommitted S23/S24 diff as unfinished implementation.
2. Read the final sections of `specs/23-project-messages-api-review.md` and `specs/24-project-chat-panel-review.md`. Earlier findings are historical and resolved; the tracker table and final reviews define current approval.
3. Plan S25 from `specs/00-build-plan.md` (Undo / redo for the turn holder, lane both, dependency S22 Committed). Create its complete just-in-time spec before implementation. Do not assume an S25 spec already exists.
4. Grok implements only the approved S25 scope, verifies it, marks Ready for review, and stops. Codex independently reviews. Keep membership S26–S28 and hardening S29 separate.

## Approved work to preserve

**S23:** ProjectMessage model, member-only paged history/send REST, text plus one image/video, `/collaborate` upload folder with `/chat` default preserved for DMs, project room message broadcast, completed-join typing relay, and message cleanup on project delete. Empty `?before=` correctly returns 400 for members, before any message query; outsiders still get 404 first. Use both `before` and `beforeId` when paging.

**S24:** Separate project chat store and responsive panel, safe history/live merge and send echo deduplication, draft/file retention on failed sends or temporary disconnect, typing expiry/refresh, unread badge, and sound-only persistence under `ajfm88-collaborate`. Every role can chat without a turn and during canvas-only recovery.

S24 review corrections are important invariants for later changes:

- `useWorkspaceStore.js` retains account ownership per Socket.IO connection id in a WeakMap. A different session account cannot gain chat by retrying/rebinding the unchanged old connection. A fresh id may establish new ownership. Null/replaced session sockets invalidate pending chat callbacks immediately.
- Both Load earlier and Retry capture the visible row. The scroll hook observes message content for media growth, releases a stale hold when the user scrolls, and preserves the newly visible position on subsequent live appends/resizes. Do not restore the older behavior while adding shortcuts or controls.
- `selectCanEdit`/`selectIsHolder` and server turn enforcement remain separate from `selectCanChat`. Do not gate project chat with the editing turn.

## Last independent verification

Final S24 code review reran all suites successfully, one root suite per command:

| Suite | Passed |
| --- | ---: |
| server: `npm test` in `server/` | 221 |
| `node --test test/workspaceSync.test.mjs` | 13 |
| `node --test test/canvasPreview.test.mjs` | 39 |
| `node --test test/participants.test.mjs` | 6 |
| `node --test test/cursorPresence.test.mjs` | 69 |
| `node --test test/turnState.test.mjs` | 10 |
| `node --test test/turnRobustness.test.mjs` | 28 |
| `node --test test/projectChat.test.mjs` | 14 |
| `node --test test/projectChatUi.test.mjs` | 5 |
| **Total** | **405** |

Server duration: 1021.4669 ms. Root build passed: Vite 7.3.5, 4275 modules, 8.77s; `WorkspacePage-CNgz3832.js` 292.98 kB, gzip 92.84 kB. Existing chunk-size warning only. Diff check passed with line-ending notices. No tests/build were repeated just for the final documentation-only cleanup.

The implementer reported a clean API boot, MongoDB database `3dfolio`, GET /health 200, process stopped, and no database writes. Review did not repeat that live connection. No browser/two-account/live attachment, `/blog`, or `/chat` QA is claimed. Mounted-hook tests use controlled element metrics; they are not a real browser layout check. A previous isolated headless browser launch was rejected by automatic approval review as blocked by policy. The shared-project walkthrough remains scheduled for S26/S28, broader mobile/accessibility QA for S29, final deployed QA for S30. Code approval does not establish launch readiness.

## S25 source map and planning questions

Read `server/src/shared/canvasOps.js` (pure, no imports), `server/test/canvasOps.test.js`, `src/collaborate/store/useWorkspaceStore.js`, `src/collaborate/lib/workspaceSync.js`, `src/collaborate/components/canvas/CanvasControls.jsx`, and `WorkspaceCanvas.jsx`. Existing sync/turn robustness tests are mandatory regression coverage.

The build-plan goals are inverse ops including cascaded edges, this tab's undo/redo stacks, clearing history on turn loss/resync, normal committed/broadcast replay, shortcuts outside text inputs, and disabled controls when unavailable. The next spec must settle these concrete issues before Grok implements:

- **Large inverses:** one valid node.remove can cascade up to 600 edges, while applyOps and each canvas commit accept at most 50 ops. Define how undo restores this graph without increasing limits, inventing an event, silently omitting edges, or assuming the inverse fits one batch. Multi-commit replay and its interrupted/partial outcome need an explicit contract if selected; no solution was approved today.
- **Op order:** inverse construction must use each operation's intermediate pre-state, reverse dependencies correctly, and restore nodes before their edges. Multiple removes can share a cascaded edge. Repeated updates, add/remove/re-add, self-loops and parallel edges need coverage.
- **History vs sync:** history is per user dispatch/gesture, not transport batching. Decide record timing and stack transitions relative to optimistic work, acknowledgements, rejection, timeout, turn loss, disconnect/rejoin, and authoritative recovery. Never replay uncertain work or let stale callbacks resurrect cleared history.
- **Round trips:** versions advance through real commits; node/edge arrays use append semantics. Define graph-equivalence assertions rather than accidentally requiring unchanged versions or unsupported z-order restoration.
- **Input isolation:** Ctrl/Cmd undo/redo and zoom shortcuts must not hijack the chat composer, node/edge label editors, other editable fields, IME, or native browser zoom. Keep canvas viewport and chat behavior intact.

No new dependency, backend protocol, limit, or history persistence is preauthorized by this handoff. S25–S30 are the six remaining launch slices. `/blog` and `/chat` removal is separate post-launch work; drawDB is a separate track and was not started.
