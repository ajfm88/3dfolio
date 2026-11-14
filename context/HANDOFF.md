# Session handoff — 2026-11-13

## Current point

S01–S26 are **committed** through HEAD `c14a185` (commit 69), which commits S25 undo/redo and the S26 invitations/members REST API with their planning and review documents. The working tree was clean before today's documentation update.

The user's plan for today is **two slices: S27, then S28**. GPT 6.1 Terra implements; Claude Opus 5.5 writes the specs and reviews. The user handles commits. Never commit, push, branch or deploy.

- **S27 — Live membership enforcement and cleanup** (server): specified in [27-live-membership-enforcement.md](specs/27-live-membership-enforcement.md). Status **Approved** (2026-11-13, uncommitted); review in [27-live-membership-enforcement-review.md](specs/27-live-membership-enforcement-review.md).
- **S28 — Share dialog and invitations UI** (client): specified in [28-share-dialog-invitations-ui.md](specs/28-share-dialog-invitations-ui.md). Status **Approved** (2026-11-13, after one correction round), uncommitted; see [the review](specs/28-share-dialog-invitations-ui-review.md). Re-review verification: server 304, ten root suites 259, membershipUi 21, build and diff check pass. The two-account walkthrough, 320px and browser focus checks were not run.

Today's documentation update reconciled AGENTS.md, the six context files, the build plan and the S25/S26 spec status lines to the committed state. It also added a planned S27 summary to `2-architecture.md` and created the S27 spec. No application or test code changed, and no suites, build, API boot or browser checks ran for planning.

## S28 implementation handoff

S28 is implemented in the working tree: Share and invitations UI and stores, live membership listeners, self-leave handling and superseded join retry. Verification passed: 304 server tests, 259 existing client tests, 20 new membership tests, production build and diff check. The build retains its existing large-chunk warning; WorkspacePage is 313.70 kB (gzip 98.75 kB), and the Collaborate dashboard chunk is 23.40 kB (gzip 6.79 kB). SSR tests use portal and route stubs. The two-account walkthrough and 320px navbar check were **not run**, and no live data was written. S27 remains Approved and uncommitted.

## S27 implementation handoff

S27 is implemented in the working tree: live socket removal and role enforcement, pending join cancellation, project room discard, REST wiring and Clerk collaborate cleanup. Server tests passed **304**; ten client suites passed **259**; production build passed with the existing large-chunk warning; `git diff --check` passed. The server booted with its configured environment and was stopped without writing live data. The webhook's existing Post/Comment/Message cascade was checked in the diff. Manual two-browser checks, live webhook and live database mutation checks were not run. Client listeners remain S28.

## What S26 left open (S27 closes it)

S26 is REST-only. A removed or demoted member who is already joined keeps their room, cached role, cursor, typing and turn rights. Project deletion does not kick connected members. The Clerk `user.deleted` webhook does not touch collaborate data. S27 fixes all of this on the server. The client listeners (`workspace:removed` navigates away with a toast; `workspace:role` re-gates the UI) are S28.

## Last independent verification (final S26 review, 2026-11-12)

542 passing: 283 server and 259 client across ten root suites (workspaceSync 13, canvasPreview 39, participants 6, cursorPresence 69, turnState 10, turnRobustness 28, projectChat 14, projectChatUi 5, canvasHistory 31, canvasShortcuts 44). Production build passes (Vite 7.3.5; `WorkspacePage` chunk 303.85 kB, gzip 96.09 kB; existing chunk-size warning only). Diff check passes. Run root suites one per command because the Vite harnesses collide on port 24678.

## Remaining verification gaps

No live MongoDB concurrency/index test, isolated-account REST cycle, real browser, touch hardware, two-account, live media, or `/blog` and `/chat` runtime check has been performed for S25 or S26. Local configuration targets the live `3dfolio` database: do not write live data to satisfy a checklist. Keep these as explicit QA gaps until suitable isolated accounts and data exist.

Preserve the approved S23–S26 behavior recorded in their final reviews: S24's connection-account ownership, S25's `retireUnownedWork` and capture-phase gesture cancellation, and S26's single-element invitation authority and snapshot guards.

## Separate deferred tracks

- drawDB editor integration: D1–D9 Todo in [the separate plan](../../3dfolio_drawdb_plan.md). Nothing ported. Discussed preferences (cloud storage, version history, public sharing; skip AI, MCP, GitHub) are not sliced.
- `/blog` and `/chat` removal stays post-launch (Phase K). Both remain in the app.
