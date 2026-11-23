# Session handoff — 2026-11-15

## Current point (2026-11-22)

HEAD is `f8e2f13` (commit 78). D1 to D7 are committed. The D6 Vercel preview check passed (user, 2026-11-21). D8 (editor canvas) is **Approved** by Grok on 2026-11-22 and uncommitted for commit 79.

D8 copies seven upstream files byte for byte into `drawdb/src/components/EditorCanvas/`. The copies have no local edits, and the canvas remains unrouted.

The root build and drawDB lint passed. The portfolio entry matches the baseline at 578.23 kB (gzip 181.05 kB). drawDB remains at 2781 modules and 1,602.87 kB of JavaScript (gzip 412.26 kB). CSS grew from 181.83 kB (gzip 25.10 kB) to 187.14 kB (gzip 26.03 kB) because Tailwind scans class names in the canvas files. The package manifests and drawDB lockfile match their pre-build hashes.

Local HTTP checks returned 200 for `/drawdb/`, `/drawdb/templates` and `/drawdb/nope/deep`. Port 5180 is clear. **Browser: not run (not required for D8)**. D8 has no Vercel gate or post-commit user check.

### Next session

1. The user commits D8 as 79 using the draft in the D8 implementation note at the end of `../3dfolio_drawdb_plan.md`. Grok Approved D8 on 2026-11-22 (`../3dfolio_drawdb_specs/D8-editor-canvas-review.md`).
2. Start **D9 (editor goes live and cleanup)** the next day after the D8 commit. D9 is the last slice and needs a spec, the local edits in plan section 7 and the full browser and Vercel checklist.

The older stopping points below are historical. The Start here list that follows dates from 2026-11-15; use the Next session list above instead.

## Start here (historical, 2026-11-15)

1. Run `git status` and `git log -3`. HEAD is `69bc3e7` (commit 71, 2026-11-15), which commits everything from 2026-11-14: S29a, S29b, S30, S31, S32, S33, the readme rewrites and the context files. The tree was clean after it.
2. The current work is the **drawDB track**. Read [the drawDB plan](../../3dfolio_drawdb_plan.md) first; slice specs and reviews are in `3dfolio_drawdb_specs/`, beside the repo. The drawDB status table is in section 8 of the plan, not in the progress tracker.
3. **D1 (app shell and tooling) is Approved** (Claude Fable 5.2 spec, Codex implementation, [Grok review](../../3dfolio_drawdb_specs/D1-app-shell-review.md), 2026-11-15). `drawdb/` is a placeholder Vite app that builds into `dist/drawdb/`. Not yet checked in a browser. **D2 (build and deploy wiring) is next**: it chains the drawDB build into the root build and adds the Vercel rewrite, then must be checked on a Vercel preview. `../drawdb-main/` stays read-only.
4. No `/collaborate` slice is open. The S30 launch QA, the manual checklists of S29b to S33 and every two-account check are **not run**; they belong to the user and do not block drawDB work.
5. Keep both readmes free of em dashes.

## Current point

All `/collaborate` work is **committed** through HEAD `69bc3e7` (commit 71): the 30 slices of the build plan and the three template slices S31 to S33 (twenty-seven templates in seven groups). Every slice is code-approved; none of it has been checked in a real browser with two accounts. `/collaborate` is **not recorded as launched**: the sixteen-item launch QA in [the tracker](6-progress-tracker.md) under `S30 — Launch QA` is entirely **not run**.

Never commit, push, branch or deploy. The user does.

## Decision: `/blog` and `/chat` stay

The user cancelled Phase K (removing `/blog` and `/chat`) on 2026-11-14. Q1 and Q5 in the tracker are marked reversed, and the build plan's Phase K is marked cancelled. Invariants 9 and 10 stay in force. Do not write or start removal slices.

`/collaborate` imports nothing from `src/chat/` or `src/blog/`. On the server it shares only generic upload plumbing with `/chat`: `uploadChatMedia` in `lib/imagekit.js` and `middleware/upload.middleware.js`.

## Last reviewed verification (S33 review, before commit 71)

- Server `npm test`: **328 passed**.
- Thirteen root client suites, one command each: canvasTemplates 14, canvasHistory 31, canvasPreview 39, canvasShortcuts 44, cursorPresence 69, membershipUi 21, mobileA11y 13, participants 6, projectChat 14, projectChatUi 5, turnRobustness 28, turnState 10, workspaceSync 13. **307 passed**.
- `npm run build` passed with the existing chunk-size warning only. Entry chunk 578.23 kB (gzip 181.05 kB).
- Nothing was rerun for the 2026-11-15 documentation update.

## What has never been run

- The launch QA: two accounts in two browsers on the deployed site, plus the phone, touch and keyboard lines.
- Any real-browser or two-account check for S16 onward, including the S31 to S33 template checklists. Every approval rests on automated tests and code review.
- The portfolio navbar at 899px, 900px and 1080px. The 900px breakpoint was chosen by estimate, not measured.
- Live MongoDB concurrency, an isolated-account REST cycle, live media, the Clerk webhook, and `/blog` and `/chat` runtime checks.

Local configuration targets the live `3dfolio` database. Do not write live data to satisfy a checklist.

## Suggested order for the user

1. Deploy commit 71 to Vercel and Render. Render was redeployed on 2026-11-15 as a new service, `ajfm88-3dfolio-api` (https://ajfm88-3dfolio-api.onrender.com, Oregon, root `server`, build `npm install` because lock files are gitignored, start `npm start`, health `/health`). Vercel `VITE_API_URL` and the Clerk webhook point at it. The old `3dfolio-ajfm88-server` and `threedfolio-ajfm88-api` services can be deleted. This deploy makes the Collaborate navbar link public before the launch QA has run.
2. Run the launch QA and fill in the tracker. After it passes, update the portfolio About text and project snippet in the admin panel.
3. D1 is committed as 72 (`c30df64`, 2026-11-16). Continue drawDB at one slice per day (the user, 2026-11-15): D2 on 2026-11-16, which proves the Vercel routing before any real drawDB code lands.
4. After the drawDB port (D9) is done: move Clerk from the Development instance to a Production instance (the user, 2026-11-15). The site currently runs on Development keys (`pk_test_`, `sk_test_`), which show a Development mode badge and have user limits. Steps: create the Production instance in Clerk and add its DNS records for `ajfm88.com`; set up sign-in methods again; put the new `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in Render and `VITE_CLERK_PUBLISHABLE_KEY` in Vercel (as Config, then redeploy); add the webhook `https://ajfm88-3dfolio-api.onrender.com/api/webhooks/clerk` with `user.created`, `user.updated` and `user.deleted`, and put its new signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`; add the session token claim `{ "metadata": "{{user.public_metadata}}" }`; set `public_metadata.role` to `admin` on your own user again. Production has new user ids, so existing users sign up again and get new MongoDB user documents; decide beforehand what happens to the Development users and the posts, chats and projects they own.

## Open items

- Q7 in the tracker: three hardening items accepted for launch (the shared 500 handler returns `err.message`; REST has no rate limit; the 1 MB socket message size).
- `server/src/index.js` still describes the API as the backend behind `/blog` and `/chat` in its landing line. It is a protected file and was left alone.

## Notes for whoever works next

- Run root suites one per command with `node --test test/<suite>.test.mjs`, because the Vite harnesses share port 24678. Server tests: `cd server && npm test`.
- Preserve the approved behavior recorded in the final reviews of S23 to S33.
- The drawDB plan lists the root files its slices may edit (`.gitignore`, `package.json`, `vercel.json`, `readme.md`). No `/collaborate` slice is in progress, so the protected-file rules in `5-ai-workflow-rules.md` do not block them.

## History: implementer notes from 2026-11-14

These notes were written before the reviews and before commit 71. Their statuses (Ready for review, uncommitted) are history: S32 and S33 are Approved and committed in `69bc3e7`.

### S32 - More starter templates (Codex, 2026-11-14)

**Status: Ready for review.** Reviewer unassigned; uncommitted.

**Changed:** Eleven templates in two frozen groups; eight new system design diagrams with optional ordinary edge labels. Group headings use h3/Eyebrow and card names h4. Corrected the grouped map closure and spacing. Extended the existing test harness without changing its lifecycle, port or portal rewrite. Added spec fingerprints/counts, group/freeze checks, all-template structure/spacing checks, builder labels and atomic rejection checks, and grouped markup/preview checks. Updated the specified product, architecture, UI, build-plan, readme and handoff documentation. The template data module was left untouched during continuation as instructed; all eleven fingerprints pass unchanged.

**Verification:** Every root suite ran via its own node --test command, sequentially: canvasTemplates 12; workspaceSync 13; turnState 10; turnRobustness 28; projectChatUi 5; projectChat 14; participants 6; mobileA11y 13; membershipUi 21; cursorPresence 69; canvasShortcuts 44; canvasPreview 39; canvasHistory 31. Other root suites total 293. Server npm test passed 328, exited on its own. Total 633 tests, zero failures. npm run build passed (4285 modules, 18.98s), with only the existing >500 kB chunk warning: entry 578.23 kB / gzip 181.05 kB, Collaborate 24.06 / 7.00 kB, WorkspacePage 340.39 / 105.17 kB (baseline 326.06 kB). Entry and Collaborate unchanged; WorkspacePage growth is the template data and specified grouping/label support.

**Static checks:** git diff --check passed (existing LF-to-CRLF notices only). Reviewed git diff --stat against the initial working tree: changes for S32 are confined to its allowed files; earlier slice modifications/untracked files remain. git diff --stat omits untracked files, including the S31 template files and test. canvasTemplates.js has exactly one import, from @shared/canvasOps.js. No raw hex in TemplatesDialog.jsx. Searches of src/ and readme.md found none of the four prohibited strings. No server, dependency, store, ShapePanel, Dialog or other protected-file changes by this slice. Existing dispatch, insertion, placement and preview behavior retained.

**Manual checklist (browser checks not run; no live projects created):**
- **Not run:** The dialog shows two headings and eleven cards, and scrolls with the mouse, touch and the Tab key.
- **Not run:** Each of the eight new templates, added to an empty canvas: lands centered, the view fits it, every node label fits inside its shape, no edge label covers a node, and the arrows read in the intended direction.
- **Not run:** In Scaling to Millions of Users, Rate Limiter, News Feed System and Notification System, the edges that fan out from one handle are readable.
- **Not run:** One Undo removes a whole new template, edge labels included; Redo brings it back; a watcher's canvas matches after each step.
- **Not run:** An inserted edge label can be edited and cleared like any other.
- **Not run:** A new template added to a canvas with content lands below it and nothing is moved.
- **Not run:** The three S31 templates still insert as before.
- **Not run:** At 320px wide the dialog still scrolls and the cards are readable.

**Limitations/deviations:** No implementation scope deviations. Static markup does not run click, insert or fitBounds handlers. Browser, real font/layout, mouse/touch/keyboard scrolling, two-account sync and all manual items above remain unverified. Workflow server boot/health and /blog load /chat DM/typing/presence runtime checks were not run; automated suites do not establish those results. No live database writes, commit, push, branch or deployment. Stop at Ready for review; no further slice work.


### S33 - Template library implementation (Codex, 2026-11-14)

**Status: Ready for review.** Implementer Codex; reviewer unassigned; uncommitted. S32 dependency is Approved by Nemotron.

**Changed:** Copied the sixteen-template data block from the spec, bringing the library to twenty-seven templates in seven frozen groups. Reassigned only the eight specified existing group values; the first eleven retain their array order and other content. The dialog uses the specified wrapping pill buttons with aria-pressed and renders one group at a time. Its keyed scroll container starts at the top on a switch, and component state remembers the group while the workspace remains mounted. Unknown initialGroup falls back to Architecture patterns. Card markup, TemplatePreview and insertion path remain unchanged. Updated the existing test harness with the spec's full fingerprint/count/group table, all-template structural and spacing checks, and default/per-group/fallback/closed markup coverage. Fingerprint function unchanged; no expected value was adjusted. Updated all section 6 documentation, including the feature bullet, architecture checkpoint, S33 UI section, Phase L, tracker and HANDOFF.

**Verification:** The prior S33 run passed canvasTemplates 14, including all 27 spec fingerprints, frozen groups/data, production applyOps/invertOps, placement, labels, atomic rejection, and all seven static group renders. Each other root suite ran unchanged in its own command, sequentially: workspaceSync 13; turnState 10; turnRobustness 28; projectChatUi 5; projectChat 14; participants 6; mobileA11y 13; membershipUi 21; cursorPresence 69; canvasShortcuts 44; canvasPreview 39; canvasHistory 31 (293 total). These passing root suites were not unnecessarily repeated during continuation; no application/test changes followed. Continuation: server npm test passed 328, zero failures/skips/cancellations, exited cleanly (11450.421 ms). Total: 635 tests passed. npm run build passed (4285 modules, 13.90s), only the existing >500 kB chunk warning. JS chunks: entry 578.23 kB / gzip 181.05 kB; Collaborate 24.06 / 7.00 kB; WorkspacePage 367.66 / 110.77 kB. Entry and Collaborate remain unchanged from S32; WorkspacePage increased from 340.39 kB by the template data and group-filter code.

**Static verification:** Both corrected searches pass: no prohibited book/author/product names in src/ or readme.md; no retired system-design group id in src/ or test/. The two pre-existing readme prose lines remain unchanged. The earlier string-search conflict was a spec error, corrected by the spec author on 2026-11-14. git diff --check passes with existing LF-to-CRLF notices only. git diff --stat reviewed alongside the initial working-tree hash snapshot, including untracked files: S33 changes stay in allowed files; earlier uncommitted work preserved. The spec author's spec correction is separate. canvasTemplates.js retains its one @shared/canvasOps.js import; freezeDeep, TEMPLATE_GAP, sizeOf, boxOf, templateBounds and buildTemplateOps are unchanged from the S33 starting snapshot. No raw hex in TemplatesDialog. No server/dependency/store/ShapePanel/Dialog/EmptyCanvasHint/WorkspaceCanvas/mobileA11y change by S33. No new socket event, payload or limit.

**Manual checklist:**

- **Not run:** The dialog opens on Architecture patterns with seven group buttons; each button shows its group and is marked as pressed; the list starts at the top after each switch.
- **Not run:** The group buttons work with the keyboard (Tab, Enter, Space), and focus stays inside the dialog.
- **Not run:** Closing and reopening the dialog shows the group last chosen.
- **Not run:** Each of the sixteen new templates, added to an empty canvas: lands centered, the view fits it, every node label fits inside its shape, no edge label covers a node, and the arrows read in the intended direction.
- **Not run:** In Web Crawler, the edge from URL Filter back to URL Frontier runs below DNS Resolver and Content Store without touching them.
- **Not run:** One Undo removes a whole new template; Redo brings it back; a watcher's canvas matches after each step.
- **Not run:** The eleven earlier templates still insert as before.
- **Not run:** At 320px wide the group buttons wrap, the dialog still scrolls and the cards are readable.

**Limitations/deviations:** No implementation scope deviations. Static markup does not run group-button clicks, the insert handler or fitBounds. Browser layout, real-font label fit, touch/keyboard interaction, focus trapping, reopening state, scroll reset and two-account synchronization remain unverified. Workflow server boot/health and /blog and /chat runtime checks were not run. No live projects or other live data were created. No commit, push, branch or deployment. Stop at Ready for review.
