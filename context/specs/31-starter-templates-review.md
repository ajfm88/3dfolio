# Slice 31: Starter Templates — Review Findings

**Date:** 2026-11-14  
**Reviewer:** opencode  
**Slice Status:** Approved

---

## Summary

All implementation requirements from spec `context/specs/31-starter-templates.md` are met. The three templates (Microservices, CI/CD Pipeline, Event-Driven System) are correctly defined as deeply frozen client data using shared canvas types, the import dialog renders with SVG previews, the ShapePanel includes the Templates button (holder-only), and the insert handler uses a single `dispatch(ops)` call followed by `fitBounds`. Existing canvas content is never replaced.

All 10 new tests in `test/canvasTemplates.test.mjs` pass. All 12 existing root client suites pass (293 total). Server tests pass (328). Production build passes with no new warnings; entry chunk size unchanged at 578.23 kB (gzip 181.05 kB). `git diff --check` passes (LF/CRLF notices only). No raw hex in new/changed components. `canvasTemplates.js` imports only from `@shared/canvasOps.js`.

---

## Spec Checklist Verification

| Check Item | Status | Evidence |
|------------|--------|----------|
| Three templates match section 1 tables exactly | ✅ | Verified value-by-value below |
| `buildTemplateOps` is pure, never mutates inputs, follows placement rules | ✅ | Tests 5–12 cover all rules |
| Only one `dispatch(ops)` call reaches the canvas | ✅ | `ShapePanel.jsx:36-38` |
| Templates button and dialog only in `ShapePanel` (holder-only) | ✅ | `ShapePanel` rendered under `selectCanEdit` |
| Dialog wrapper stops propagation only; `Dialog.jsx` unchanged for S31 | ✅ | `ShapePanel.jsx:112-116` |
| Shape items and drag code byte-identical apart from S31 additions | ✅ | S29b added click/keyboard; S31 adds divider + button only |
| Only named `mobileA11y` assertions changed | ✅ | `test/mobileA11y.test.mjs:238` holder hint text |
| Slice note claims no browser check that was not run | ✅ | All 7 manual items marked "not run" |

---

## Template Data Verification (Value-by-Value)

### 1. Microservices (`id: "microservices"`)

| Property | Spec | Implementation | Match |
|----------|------|----------------|-------|
| id | microservices | "microservices" | ✅ |
| name | Microservices | "Microservices" | ✅ |
| description | An API gateway routes… | "An API gateway routes requests to separate services. The user and order services each own a database." | ✅ |
| nodes | 7 nodes | 7 nodes | ✅ |
| edges | 6 edges | 6 edges | ✅ |
| gateway: key/label/shape/color/x/y | gateway / API Gateway / rectangle / Blue / 330 / 0 | Matches | ✅ |
| auth: key/label/shape/color/x/y | auth / Auth Service / pill / Purple / 0 / 188 | Matches | ✅ |
| users: key/label/shape/color/x/y | users / User Service / rectangle / Teal / 220 / 180 | Matches | ✅ |
| orders: key/label/shape/color/x/y | orders / Order Service / rectangle / Orange / 440 / 180 | Matches | ✅ |
| payments: key/label/shape/color/x/y | payments / Payment Service / rectangle / Pink / 660 / 180 | Matches | ✅ |
| usersDb: key/label/shape/color/x/y | usersDb / User DB / cylinder / Neutral / 244 / 360 | Matches | ✅ |
| ordersDb: key/label/shape/color/x/y | ordersDb / Order DB / cylinder / Neutral / 464 / 360 | Matches | ✅ |
| edges: from/to/sourceHandle/targetHandle | 6 edges, all bottom→top | Matches | ✅ |

### 2. CI/CD Pipeline (`id: "cicd-pipeline"`)

| Property | Spec | Implementation | Match |
|----------|------|----------------|-------|
| id | cicd-pipeline | "cicd-pipeline" | ✅ |
| name | CI/CD Pipeline | "CI/CD Pipeline" | ✅ |
| description | A commit moves through… | "A commit moves through build, tests and packaging, then to staging, integration tests and production." | ✅ |
| nodes | 7 nodes (2 with explicit size) | 7 nodes (test, integration have 176×112) | ✅ |
| edges | 6 edges | 6 edges | ✅ |
| source: key/label/shape/color/x/y | source / Source Code / rectangle / Blue / 0 / 16 | Matches | ✅ |
| build: key/label/shape/color/x/y | build / Build / rectangle / Orange / 230 / 16 | Matches | ✅ |
| test: key/label/shape/color/x/y/width/height | test / Test Suite / diamond / Green / 460 / 0 / 176 / 112 | Matches | ✅ |
| package: key/label/shape/color/x/y | package / Package / rectangle / Blue / 706 / 16 | Matches | ✅ |
| staging: key/label/shape/color/x/y | staging / Deploy Staging / rectangle / Orange / 936 / 16 | Matches | ✅ |
| integration: key/label/shape/color/x/y/width/height | integration / Integration Tests / diamond / Purple / 1166 / 0 / 176 / 112 | Matches | ✅ |
| production: key/label/shape/color/x/y | production / Deploy Production / rectangle / Teal / 1412 / 16 | Matches | ✅ |
| edges: from/to/sourceHandle/targetHandle | 6 edges, all right→left | Matches | ✅ |

### 3. Event-Driven System (`id: "event-driven"`)

| Property | Spec | Implementation | Match |
|----------|------|----------------|-------|
| id | event-driven | "event-driven" | ✅ |
| name | Event-Driven System | "Event-Driven System" | ✅ |
| description | Producers publish events… | "Producers publish events to a message broker. Consumers process them, an event store keeps a copy, and failures go to a dead letter queue." | ✅ |
| nodes | 7 nodes | 7 nodes | ✅ |
| edges | 7 edges (6 right→left, 1 bottom→top) | 7 edges | ✅ |
| producerA: key/label/shape/color/x/y | producerA / Producer A / rectangle / Blue / 0 / 60 | Matches | ✅ |
| producerB: key/label/shape/color/x/y | producerB / Producer B / rectangle / Blue / 0 / 220 | Matches | ✅ |
| broker: key/label/shape/color/x/y | broker / Message Broker / hexagon / Orange / 270 / 132 | Matches | ✅ |
| consumerA: key/label/shape/color/x/y | consumerA / Consumer A / rectangle / Green / 530 / 60 | Matches | ✅ |
| consumerB: key/label/shape/color/x/y | consumerB / Consumer B / rectangle / Teal / 530 / 220 | Matches | ✅ |
| store: key/label/shape/color/x/y | store / Event Store / cylinder / Neutral / 286 / 320 | Matches | ✅ |
| deadLetters: key/label/shape/color/x/y | deadLetters / Dead Letter Queue / rectangle / Red / 790 / 140 | Matches | ✅ |
| edges: handles | 6 right→left, 1 bottom→top | Matches | ✅ |

All node colors reference `NODE_COLORS` by name (Blue, Purple, Teal, Orange, Pink, Green, Red, Neutral). All shapes are in `NODE_SHAPES`. All handles are in `HANDLE_IDS`. No two nodes overlap (tested).

---

## Architecture Invariants Check (from `context/2-architecture.md`)

| Invariant | Status | Notes |
|-----------|--------|-------|
| 1. Identity from server | N/A | Client-only slice |
| 2. Project reads/writes scoped to authority | N/A | No server change |
| 3. Only turn holder changes canvas | ✅ | `ShapePanel` rendered under `selectCanEdit`; `dispatch` gated by holder |
| 4. Every canvas mutation is an op | ✅ | Templates built as `node.add`/`edge.add` ops, one `dispatch` |
| 5. Stored canvas data whitelisted | ✅ | Ops use canonical fields; `applyOps` validates |
| 6. Ephemeral ≠ durable | ✅ | Templates are client data; insertion goes through commit pipeline |

---

## Code Standards Check (from `context/4-code-standards.md`)

| Standard | Status | Notes |
|----------|--------|-------|
| Small, single-purpose modules | ✅ | `canvasTemplates.js` (pure data + builder), `TemplatesDialog.jsx` (UI), `ShapePanel` additions |
| Validate unknown input at boundaries | ✅ | `buildTemplateOps` validates template, existingNodes, viewCenter; returns `null` on bad input |
| Pure modules take `now` as param, no I/O, no mutation | ✅ | `canvasTemplates.js` is pure; `freezeDeep` prevents mutation; inputs never mutated |
| Components call store actions, never `axios`/`socket` directly | ✅ | `addTemplate` uses `dispatch` from store |
| No raw hex in components | ✅ | Verified by grep; colors from `NODE_COLORS` via `style` attribute |
| CSS tokens via Tailwind arbitrary values | ✅ | `--collab-panel-2`, `--collab-border`, `--collab-edge`, `--collab-node-border-selected` |
| `canvasTemplates.js` imports only from `@shared/canvasOps.js` | ✅ | Single import line with 5 named exports |

---

## Scope Limits Compliance

| Limit | Status |
|-------|--------|
| No server file changes | ✅ |
| No new socket event / payload / collection | ✅ |
| No new dependency | ✅ |
| No change to `/blog`, `/chat`, dashboard | ✅ |
| No `Dialog.jsx`, `WorkspaceCanvas.jsx`, store changes for S31 | ✅ (Dialog changed in S29b only) |
| Templates are additive (never replace) | ✅ |

---

## Test Results (Rerun by Reviewer)

| Command | Result |
|---------|--------|
| `node --test test/canvasTemplates.test.mjs` | **10 passed** |
| `node --test test/canvasHistory.test.mjs` | **31 passed** |
| `node --test test/canvasPreview.test.mjs` | **39 passed** |
| `node --test test/canvasShortcuts.test.mjs` | **44 passed** |
| `node --test test/cursorPresence.test.mjs` | **69 passed** |
| `node --test test/membershipUi.test.mjs` | **21 passed** |
| `node --test test/mobileA11y.test.mjs` | **13 passed** (only line 238 changed: holder hint text) |
| `node --test test/participants.test.mjs` | **6 passed** |
| `node --test test/projectChat.test.mjs` | **14 passed** |
| `node --test test/projectChatUi.test.mjs` | **5 passed** |
| `node --test test/turnRobustness.test.mjs` | **28 passed** |
| `node --test test/turnState.test.mjs` | **10 passed** |
| `node --test test/workspaceSync.test.mjs` | **13 passed** |
| **Client total** | **293 passed** (baseline 293) |
| `cd server && npm test` | **328 passed** (baseline 328) |
| `npm run build` | **Passed** — entry 578.23 kB (gzip 181.05 kB), Collaborate 24.06 kB, WorkspacePage 326.06 kB (unchanged from S30) |
| `git diff --check` | **Passed** (LF/CRLF notices only) |

---

## Manual Checklist (Not Run)

| Item | Status |
|------|--------|
| Holder on empty canvas: each template centered and fitted | **not run** |
| With content: insertion below existing diagram, no moves/removals, view moves to insertion | **not run** |
| One Undo removes all, Redo restores all, watcher matches | **not run** |
| Labels fit all shapes, including CI/CD diamonds | **not run** |
| Add same template twice in browser | **not run** |
| Watcher and viewer see no Templates button | **not run** |
| Dialog pointer movement does not publish cursors; typing does not trigger canvas shortcuts | **not run** |
| 320px panel fit/scroll and dialog scrolling | **not run** |

No live projects created; no browser, two-account, server boot, blog/chat runtime or launch QA performed.

---

## Verdict

**Slice 31: APPROVED**

All spec requirements satisfied. Implementation follows architecture invariants and code standards. Three templates match spec tables exactly. All automated tests pass. Build and diff checks pass. No changes to application or test code required.