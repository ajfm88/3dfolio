# S34 - Serve the workspace at /sysdesign

Spec author: Claude (Opus 5.5), 2026-11-24. Implementer: Claude Sonnet (subagent). Reviewer: Claude Haiku (subagent). Assigned by the user on 2026-11-24.
Status: Spec ready; implementation not started.
Dependency: S01 to S33 committed (`69bc3e7`, commit 71). In the working tree: the drawDB slices D10 to D12 (`../3dfolio_drawdb_specs/`), uncommitted. D12 already rewrote `vercel.json`.

## Goal

The user decided on 2026-11-23 that the system design workspace is served at `/sysdesign` instead of `/collaborate`, and drawDB at `/dbdesign` instead of `/drawdb` (that is D12). **Only URLs change.** The `src/collaborate/` folder, `src/pages/Collaborate.jsx`, component and store names, CSS variables (`--collab-*`), socket events, the server, the ImageKit media folder `/collaborate`, the localStorage key `ajfm88-collaborate`, and visible text such as the navbar label `Collaborate` and the heading `ajfm88 Collaborate` all stay. Renaming visible text is a separate decision for the user.

Old links keep working through a permanent Vercel redirect from `/collaborate/:path*` to `/sysdesign/:path*`. That pattern also matches `/collaborate` itself, and Vercel keeps the query string.

Read `AGENTS.md`, `context/5-ai-workflow-rules.md` (protected files), then this spec. This spec explicitly names the protected files it may edit: `src/App.jsx`, `src/components/Navbar.jsx` and `vercel.json`. Do this one slice and stop. Never commit, push, branch or deploy.

## Baseline

HEAD `65a692b` (commit 80). Uncommitted drawDB changes from D10, D11 and D12 are present under `drawdb/` and in `vercel.json`. Leave them alone except for the one `vercel.json` change below. The seven source files below are unchanged from HEAD. `vercel.json` must be D12's version: CRLF, 277 bytes, SHA256 `6ac5ede8db6eeb78b20716965944ed92dd269f971dcf7d3d62b4c5790e4cde21`. If it is not, stop and report.

The search `git grep -n -E "[\"'\`]/collaborate" -- src` finds exactly the nine route literals below and nothing else. The client tests under `test/` reference only the `src/collaborate/` folder, never the URL, so no test changes. On the server, `/collaborate` appears only as the ImageKit folder name, which stays.

Keep each file's line endings. `src/App.jsx`, `src/pages/Collaborate.jsx` and `ProjectCard.jsx` are LF. `src/components/Navbar.jsx`, `WorkspaceNavbar.jsx`, `ProjectsPage.jsx`, `WorkspacePage.jsx` and `vercel.json` are CRLF in the working tree. Use exact string replacement that leaves the line endings alone, then check the hashes.

## Allowed changes

### 1. Nine route literals in seven files

In each file below, replace the substring `/collaborate` with `/sysdesign` **only where it immediately follows a double quote or a backtick** (regex `(["\x60])\/collaborate` to `$1/sysdesign`). Comments, imports (`../collaborate/...`) and component names do not match and must not change.

| File | Literals | Lines (approx.) | Result bytes | Result SHA256 |
| --- | ---: | --- | ---: | --- |
| `src/App.jsx` | 1 | 112 `path="/collaborate/*"` | 3494 | `877d8e7077914802fb944e1103953b82962f7a0e75c9e4d329965b4b96924bd4` |
| `src/components/Navbar.jsx` | 2 | 70 and 119, `to="/collaborate"` | 6558 | `8dbcffcc9cd844106eaa252eba34a521289313db258398ad65face289d81026b` |
| `src/pages/Collaborate.jsx` | 1 | 80, `<Navigate to="/collaborate" replace />` | 3941 | `ef834b6b9caa1d775a4bdf34c7ead79429854803e3aac4268c0613e2ba94a8c5` |
| `src/collaborate/components/projects/ProjectCard.jsx` | 1 | 11, `` to={`/collaborate/${project._id}`} `` | 2328 | `3bd412aca6f662635f94e2ed270c47f8ef36a54c2bcffffd9b2da9ef18058626` |
| `src/collaborate/components/workspace/WorkspaceNavbar.jsx` | 1 | 39, `<Link to="/collaborate"` | 3934 | `cd10abd037496235af28ab59b7d9af1857e8301592e991ba459bd5dde5463ecc` |
| `src/collaborate/routes/ProjectsPage.jsx` | 1 | 86, `` navigate(`/collaborate/${project._id}`) `` | 8545 | `5faa5a92e454e7da0fe4ff0a210787670d8cc3702dcc861dbc74fbe30d8802dc` |
| `src/collaborate/routes/WorkspacePage.jsx` | 2 | 31 `<Link to="/collaborate"` and 75 `<Navigate to="/collaborate" replace />` | 4753 | `22cb79ac6487b0c48c13fddd010c87f4fdcfe44ebfed89169082309704eaed96` |

The spec author computed these hashes on 2026-11-24 by applying the regex to the current files. The comment in `src/pages/Collaborate.jsx` line 2 (`the lazy /collaborate chunk`) stays as written.

### 2. `vercel.json`, add the second redirect

Replace the whole file with this content, CRLF line endings, two-space indent, trailing CRLF:

```json
{
  "redirects": [
    { "source": "/drawdb/:path*", "destination": "/dbdesign/:path*", "permanent": true },
    { "source": "/collaborate/:path*", "destination": "/sysdesign/:path*", "permanent": true }
  ],
  "rewrites": [
    { "source": "/dbdesign/:path*", "destination": "/dbdesign/index.html" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Result: 374 bytes, SHA256 `1246ea7cdb2fd18574722ca80ddbfee20cb81bcc2c5d9f37d6a33ffe21d62634`. Write it with Node (`text.replace(/\n/g, "\r\n")`), because editors usually save LF.

### Not allowed

- Folder, file, component, store, CSS variable, socket event, localStorage key or visible-text renames.
- `server/` (the ImageKit folder `/collaborate` is storage, not a URL), `test/`, `index.html`, `public/` (the sitemap lists neither route).
- A client-side `/collaborate` route in `App.jsx`. The Vercel redirect covers full page loads, and nothing in the app links to the old path any more.
- Fixing the pre-existing `projectChatUi` failure (see Verification 3).
- Docs: `readme.md`, `server/readme.md`, `AGENTS.md`, `context/` files other than this spec. D13 updates them.

## Verification

Run from the repo root.

1. **Edits.** Bytes and SHA256 of the eight files match. `git grep -n -E "[\"'\`]/collaborate" -- src` finds nothing. `git grep -n -E "[\"'\`]/sysdesign" -- src` finds exactly the nine literals. `vercel.json` parses as JSON.
2. **Build.** `npm run build` exits 0. The portfolio entry chunk changes by a few bytes only, because `App.jsx` and `Navbar.jsx` are in it (each literal is two characters shorter). Record entry size and gzip; a change of more than 200 bytes either way is a stop. drawDB still builds into `dist/dbdesign/`.
3. **Client tests.** Run each of the 13 suites in its own command, one after another (they share port 24678): `node --test test/<suite>.test.mjs` for canvasTemplates, canvasHistory, canvasPreview, canvasShortcuts, cursorPresence, membershipUi, mobileA11y, participants, projectChat, projectChatUi, turnRobustness, turnState, workspaceSync. Baseline at HEAD (spec author, 2026-11-24): 14, 31, 39, 44, 69, 21, 13, 6, 14, 4 pass and 1 fail, 28, 10, 13. The one `projectChatUi` failure is pre-existing: the test `keeps the composer available for a viewer and labels the navbar badge` still expects the placeholder `Message the project`, which was shortened to `Message` on 2026-11-16. Expect exactly the same counts and the same single failure. Anything else is a stop. Server tests are not needed (no server change).
4. **Browser.** From the repo root, start `npx vite preview --port 4174 --strictPort` in the background and wait for HTTP 200 on `http://localhost:4174/`. From `../3dfolio_drawdb_specs/tools/`, run `node workspace-route-check.mjs http://localhost:4174 sysdesign collaborate`. Pass the route names without a leading slash. It must end with `{"summary":"PASS"...}`: the navbar links to `/sysdesign` and not to `/collaborate`, `/sysdesign` and `/sysdesign/<id>` load the lazy Collaborate chunk, and `/collaborate` no longer does. The local build has no root `.env`, so the workspace itself logs `Cannot read properties of undefined (reading 'replace')` from `VITE_API_URL`; that is expected locally, is printed as info, and does not fail the check. (The spec author confirmed the check fails on the HEAD build when pointed at `sysdesign`.) Stop the preview and confirm nothing listens on 4174.
5. **Scope.** `git status --short --untracked-files=all` equals the D12 list plus the seven source files, with `vercel.json` still listed once, and this spec (untracked). `git diff --check` exits 0.

## For the user after the commits (Vercel preview)

- The navbar's Collaborate link opens `/sysdesign`; signed out it shows the sign-in screen, signed in the projects dashboard.
- Opening a project goes to `/sysdesign/<id>`; Back to projects returns to `/sysdesign`.
- `/collaborate` and `/collaborate/<id>` redirect to the same path under `/sysdesign`.
- If the Clerk dashboard lists any `/collaborate` URL (for example an allowed redirect URL), change it to `/sysdesign`.

## Stop conditions

Stop and report if a baseline hash or a literal count differs, a result hash differs, the build fails or the entry changes by more than 200 bytes, a test count differs from the baseline, or the browser check fails.

## Finish

- Append a section `## Implementation report (<date>)` at the end of this file: status (Ready for review, or Stopped), baseline, commands with exit codes, the 13 suite results, the full JSON from step 4, deviations (or None), not run.
- In `../3dfolio_drawdb_plan.md` section 10, set the S34 row to `Ready for review` (or `Stopped`) with the date. Nothing else there.
- Do not update `context/6-progress-tracker.md` or other docs; D13 does.
- No commit message. Do not end your turn before the report is written.

## Implementation report (2026-11-24)

Status: **Stopped** (stop condition: a test count differs from the baseline).

Baseline: `vercel.json` was D12's version (277 bytes, SHA256 `6ac5ede8...`). The nine route literals were found exactly as listed.

Commands and results:
- Edits: regex `(["\x60])\/collaborate` to `$1/sysdesign` applied with Node using latin1 read and write, so line endings were kept. All seven result hashes and byte counts match the spec. `vercel.json` written with CRLF via Node: 374 bytes, SHA256 `1246ea7c...2634`, matches, parses as JSON. grep for `/collaborate` literals in `src`: none. grep for `/sysdesign` literals: 9.
- `npm run build`: exit 0. Entry chunk 578226 bytes before (`index-B08M9daK.js`, from the previous dist) to 578220 bytes after (`index-Dwf6cs4t.js`), gzip 181.06 kB reported by Vite. Within tolerance. `dist/dbdesign/` still built.
- Client suites (pass/fail): canvasTemplates 14/0, canvasHistory 31/0, canvasPreview 39/0, canvasShortcuts 44/0, cursorPresence 69/0, **membershipUi 20/1 (baseline 21/0)**, mobileA11y 13/0, participants 6/0, projectChat 14/0, projectChatUi 4/1 (the known pre-existing failure), turnRobustness 28/0, turnState 10/0, workspaceSync 13/0. The membershipUi result was reproduced three more times.
- Scope: `git status` shows the D12 list plus the seven source files, `vercel.json` once, and this spec. `git diff --check` exits 0 (only LF/CRLF warnings).

Cause of the stop: the spec says the client tests never reference the URL. That is wrong for `test/membershipUi.test.mjs` line 148. The test `dashboard shows invitations only when present and removed workspace renders navigation` asserts `html.includes('data-route="/collaborate"')` for the removed-workspace `<Navigate to=... />` in `WorkspacePage.jsx`, which now renders `/sysdesign`. Fixing it needs a one-line change in `test/` (`data-route="/sysdesign"`), which the spec forbids, so I did not touch it.

Full JSON from the browser check: not available, see Not run.

Deviations: none in the edits. The test file needs the spec author's ruling.

Not run: browser check (`workspace-route-check.mjs`), because of the stop condition. The preview server was never started, so nothing listens on 4174.

## Spec correction (spec author, 2026-11-24, after the first run stopped)

The first run stopped correctly. The spec was wrong to say the client tests never reference the URL. Three test literals do:

- `test/membershipUi.test.mjs` line 148 asserts `data-route="/collaborate"` in the removed-workspace render of `WorkspacePage`. After the rename, the page renders `/sysdesign`, so this assertion must follow it.
- `test/turnRobustness.test.mjs` lines 490 and 492 mount `WorkspacePage` in their own `MemoryRouter` at `/collaborate/${PROJECT}` with the route `/collaborate/:projectId`. That suite passes either way, but it should use the real route.

Allowed in addition to section 1, with the same regex (`(["'\x60])\/collaborate` to `$1/sysdesign`) and line endings kept (membershipUi is CRLF, turnRobustness is LF):

| File | Literals | Before (bytes, SHA256) | Result bytes | Result SHA256 |
| --- | ---: | --- | ---: | --- |
| `test/membershipUi.test.mjs` | 1 | 21068, `ca9653e87399043d631aa20eff3b7f4b812609cc204636fbd75c3f1589f86206` | 21066 | `e67d3ce149274c1efefff01b654c1c7aa3752b118b3a5274142e9fdcdf36cee9` |
| `test/turnRobustness.test.mjs` | 2 | 58320, `b8ce79f8cc8bc7cd63e3ec9893337b117deef7c21b439242a4c0d7c156889786` | 58316 | `dda5b7af45c8af300ec6ee2ad659975f36f051af883a67cf835dbd84f9d0db80` |

Imports such as `../src/collaborate/...` do not match the regex and stay unchanged. Expected suite results after the correction: membershipUi 21 pass and 0 fail, turnRobustness 28 pass and 0 fail. Everything else is as in Verification 3, including the single pre-existing `projectChatUi` failure. Scope now also includes these two test files.

### Resumed after spec correction (2026-11-24)

Final status: **Ready for review** (supersedes the Stopped status above; the stop record stays as written).

- Before hashes and bytes of both test files matched the correction table. Replacement used the correction regex with latin1 read and write, so line endings were kept. After: `test/membershipUi.test.mjs` 21066 bytes, `e67d3ce1...cee9`; `test/turnRobustness.test.mjs` 58316 bytes, `dda5b7af...0db80`. Both match.
- `node --test test/membershipUi.test.mjs`: 21 pass, 0 fail. `node --test test/turnRobustness.test.mjs`: 28 pass, 0 fail. The other 11 suites were not rerun (source and build unchanged since their results above). Together with the earlier results, all 13 suites equal the baseline, with the single pre-existing `projectChatUi` failure.
- Browser check (`vite preview` on 4174, HTTP 200, then `node workspace-route-check.mjs http://localhost:4174 sysdesign collaborate`):
  - `{"step":"navbar-link","pass":true,"linksToRoute":1,"linksToOldRoute":0}`
  - `{"step":"route-loads-workspace-chunk","pass":true,"chunk":"/assets/Collaborate-By6FsSxA.js","path":"/sysdesign"}`
  - `{"step":"project-route-loads-workspace-chunk","pass":true,"chunk":"/assets/Collaborate-By6FsSxA.js","path":"/sysdesign/000000000000000000000000"}`
  - `{"step":"old-route-no-longer-matches","pass":true,"chunk":null,"path":"/collaborate"}`
  - `{"info":"console-errors","count":5,...}` (the expected `VITE_API_URL` `replace` TypeError, plus a THREE.BufferGeometry NaN radius message)
  - `{"summary":"PASS","failed":[]}`
- Server stopped; zero listeners on 4174.
- Scope: `git status` shows the D12 list, the seven source files, `vercel.json` once, the two test files, and this spec (untracked). `git diff --check` exited 0 earlier; no further file changes since except the two test files.
- Deviations: none. Not run: none.
