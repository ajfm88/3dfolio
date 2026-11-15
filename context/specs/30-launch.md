# Slice 30 — Launch

**Execution status (2026-11-14): Todo.** Spec written; implementation not started.

**Lane** client + docs · **Depends on** S29a and S29b (both Approved, uncommitted on `efb06d9`) · **Unblocks** the launch QA, then Phase K

**Spec author** Claude Fable 5.2 · **Implementer** Grok · **Reviewer** Nemotron (same assignment as S29a and S29b; the user confirms)

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, and this spec. Recheck `git status` and `git log -3` before starting. S29a and S29b may still be uncommitted in the working tree, or the user may have committed them as commit 71. Either way, **do not change any application or test file from those slices.**

Baseline from the S29b review: server suite **328**; twelve root client suites (the eleven older ones at 280, plus `mobileA11y`); production build passing. Take the `mobileA11y` count from the S29b slice note.

This is the last slice of the build plan. It has two halves, and only the first is yours:

1. **Implementation (this spec, Grok):** the navbar link, the root `readme.md`, a consistency pass over `server/readme.md`, and the context files.
2. **Launch QA (the user):** the two-browser script on the deployed site. An agent cannot run it. Section 6 prepares the record for it.

No server code changes. No change to `/collaborate` code. No new dependency.

Mark S30 In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy.

## Allowed files

| File | Work |
| --- | --- |
| `src/components/Navbar.jsx` | Collaborate link, desktop and mobile; breakpoint change (S30 is this file's one allowed slice) |
| `readme.md` | Sections listed in section 2 |
| `server/readme.md` | Consistency pass in section 3. Documentation only |
| `context/1-project-overview.md`, `context/2-architecture.md`, `context/3-ui-context.md`, `context/4-code-standards.md`, `context/5-ai-workflow-rules.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md`, `context/specs/00-build-plan.md`, `AGENTS.md` | Status lines and the QA record |

Everything else stays unchanged. In particular: `src/App.jsx`, `src/constants/index.js`, every file under `src/collaborate/`, `src/chat/`, `src/blog/` and `server/src/`, `index.html`, `vercel.json`, and every test. If the work seems to need another file, stop and record an open question in the tracker.

## 1. `src/components/Navbar.jsx`

The portfolio navbar already has route links for **Blog** and **Chat**, each once in the desktop pill and once in the mobile menu. Leave both exactly as they are. (The build plan says not to add a `/chat` link; it already exists and is removed with `/chat` in Phase K.)

**Add a Collaborate link in both places, directly before the Blog link.**

- Use react-router's `Link` with `to="/collaborate"`, the text `Collaborate`, and the same `className` and `onClick` as the Blog link beside it (the desktop copy for the desktop pill, the mobile copy for the mobile menu).
- Do not import anything from `src/collaborate/`. The navbar ships in the entry bundle, and invariant 8 keeps collaborate code out of it. The link is a plain route link.

**Move the desktop pill's breakpoint from 810px to 900px.** The pill is `shrink-0` and is already tight at 810px; one more link would push it past the viewport between 810px and about 900px. Change both classes that carry the breakpoint:

- the desktop pill: `min-[810px]:flex` → `min-[900px]:flex`
- the hamburger wrapper: `min-[810px]:hidden` → `min-[900px]:hidden`

Update the numbers in the existing comment above the pill so it stays true (the pill now turns on at 900px), and add one sentence saying why it moved. Keep the comment's voice. Leave the `min-[1080px]` classes alone.

Nothing else in the file changes: not the logo, the wordmark, the `navLinks` loop, the colors or the mobile menu container.

## 2. Root `readme.md`

Keep the existing structure, emoji headings, table style and tone. Change only what is listed.

- **Introduction.** Replace the sentence that says the workspace is "in development ... reachable by URL only ... not launch-ready" and its links to the handoff and tracker. The site now has **four** extra tools: the GitHub Follower Tracker (`/gft`), the blog (`/blog`), the real-time chat (`/chat`), and the **collaborative system-design workspace** (`/collaborate`). Describe the workspace in one sentence: signed-in users create projects, invite collaborators, and design diagrams together on a shared canvas where one person edits at a time.
- **Architecture.** The table row already lists `/collaborate`. In the paragraph under it, make sure the workspace is named alongside the blog and chat as a reason the Express server exists (rooms, presence, turn-taking, and server-validated canvas saves). One or two sentences.
- **Tech Stack.** Add `React Flow` (`@xyflow/react`, https://reactflow.dev) to the "Frontend — data, auth and content" list with a fitting emoji. Add nothing else.
- **Features.** Add these bullets after the chat bullets and before "Lazy Feature Routes", in the list's existing format (emoji, bold title, one sentence). Use this content; you may polish wording but not add claims:
  - **Collaborative Workspace (`/collaborate`):** Signed-in users create projects and design system diagrams together on a shared React Flow canvas with six shapes, labelled connections and an eight-color palette.
  - **Turn-Based Editing:** One browser tab edits at a time while everyone else watches live; the server enforces the turn, with a queue, a 20-second reconnect grace and a 2-minute idle hand-off.
  - **Live Presence:** Participant avatars, live cursors, and live drag and resize previews from whoever holds the turn.
  - **Project Chat:** A chat thread per project with history, image and video attachments, typing indicators and an unread badge.
  - **Sharing and Roles:** Owners invite by email as editor or viewer, change roles and remove members, and every change applies live.
  - **Undo and Redo:** The turn holder can undo and redo their own edits, and watchers see the same result.
  - Update the existing "Lazy Feature Routes" bullet to name the workspace with the admin panel, blog and chat.
- **Project Structure.** Add to the tree, in its existing style with a short comment per line:
  - `src/collaborate/` with its real subfolders (`components/` and its `canvas`, `chat`, `projects`, `ui`, `workspace` folders; `hooks/`; `lib/`; `routes/`; `store/`; `collaborate.css`). List folders and one line on what each holds. Do not list every file.
  - `src/pages/Collaborate.jsx`.
  - `test/` at the root (client store and markup suites, run one per command).
  - `context/` (the spec-driven build documents).
  - Read the real folders before writing. Do not list a file or folder that does not exist.
- **Pages and Routes.** Add two rows: `/collaborate` (Projects dashboard, Lazy, Signed in) and `/collaborate/:projectId` (Workspace, Lazy, Project members). In the paragraph below the table, add the workspace to the sentence about what a visitor never downloads (React Flow included), and one sentence: a signed-out visitor sees a sign-in screen, and a project is visible only to its owner and invited members.
- **Quick Start.** Where the text says the Clerk key signs users in to `/blog` and `/chat`, and where it says `/blog` and `/chat` need the `server/` API, add `/collaborate`. Add one short line on running the tests: `cd server && npm test`, and `node --test test/<suite>.test.mjs` at the root, one suite per command.

Do not change badges, the Live App links, the image, the environment variable list, or any blog, chat, admin or portfolio text beyond the edits above.

## 3. `server/readme.md` consistency pass

Documentation only. Do not change any documented behavior, payload, status code or example. Read the file end to end and fix exactly these:

1. **Project Structure tree.** Add the files that exist and are missing: `src/lib/rateLimit.js`, `src/lib/projectCleanup.js`, and in `test/`: `canvas.socket.test.js`, `cursor.socket.test.js`, `membership.socket.test.js`, `projectCleanup.test.js`, `projectMember.api.test.js`, `projectMembership.test.js`, `rateLimit.test.js`, `rateLimit.socket.test.js`. Compare the tree against the real `server/src` and `server/test` folders and add anything else that exists and is missing. Remove nothing that exists.
2. **Slice numbers.** Readers of this file do not know the build plan. Remove slice labels such as `(S26)`, `(S06)`, `S13 acked`, `S17 replaces` from headings and prose, rewording the sentence so it states the current behavior only. Example: "S13 acked `participants: []`. S17 replaces that empty list with every user ..." becomes "`participants` lists every user ...". Do not change what the sentence says is true today.
3. **Single-instance note.** Add a short subsection `### Single instance` at the end of the Deployment section: project rooms, participants, turns, cursors, the per-room write queue, rate-limit buckets and the live-membership hooks all live in one process's memory; the service must run as exactly one instance; a restart drops sockets and turns and loses nothing saved; scaling out would need the Socket.io Redis adapter and shared turn state, which is not built. The existing scattered mentions stay.
4. **Contradictions.** If two places describe the same event, limit or status differently, do not pick one. Record both `path:line` references in the slice note for the spec author.

## 4. Context files

- `6-progress-tracker.md`: S30 row and slice note. Fix any status line that still calls S29a or S29b Ready for review or Todo. Add the QA record from section 6.
- `HANDOFF.md`: current point, what was run, and that launch QA is the user's next step.
- `1-project-overview.md`, `2-architecture.md`, `3-ui-context.md`, `4-code-standards.md`, `5-ai-workflow-rules.md`, `00-build-plan.md`, `AGENTS.md`: update the checkpoint and status lines only. In `5-ai-workflow-rules.md`, the protected-file line for `Navbar.jsx` stays as it is. In `4-code-standards.md`, the line "The root `readme.md` is updated at S30" stays.
- Do not rewrite history sections or earlier slice notes.

## 5. Things that stay true

- `/collaborate` code stays inside its lazy chunk. The entry chunk grows only by the link markup (a few hundred bytes at most).
- `/blog` and `/chat` links, routes and behavior are unchanged.
- No server file changes, so the server suite count does not move.

## 6. Launch QA record (prepared by you, run by the user)

Add a section `### S30 — Launch QA` to the tracker containing the checklist below, **every line marked "not run"**. Do not mark anything passed. The user fills it in after deploying.

Use two accounts, A (owner) and B, in separate browsers, on the deployed site.

1. A creates a project, opens it, requests the turn, and adds 4 shapes, 3 edges, labels, and colors.
2. A invites B as viewer. B accepts from the dashboard and opens the project. B sees the canvas, A's cursor, and A's live drags, and can chat but can't request the turn.
3. A promotes B to editor. B's UI switches live, and B requests the turn and is queued.
4. A releases. B gets the turn with a toast and edits. A sees the edits live.
5. B goes idle for 2 minutes while A is queued. The turn passes to A.
6. A takes control while B holds the turn. B lands at the front of the queue.
7. B toggles offline for 10s while holding the turn and keeps it. B closes the tab, and after 20s the turn passes on.
8. Undo and redo a sequence, and both browsers match.
9. Reload both browsers. Canvas and chat history are intact.
10. A removes B, and B is kicked to the dashboard with a toast. A deletes the project, and the project disappears from both.
11. `/blog` and `/chat` still work.
12. Phone or 320px window: the workspace navbar shows back, name, people count, Share and Chat with nothing clipped.
13. Touch device: tapping a shape adds it; a node drags; a selected node shows its handles; tap-to-connect works; Delete selected removes the selection.
14. Keyboard: Tab reaches each shape in the panel, and Enter and Space add it.
15. Portfolio navbar: at 900px and 1080px wide the pill fits on one line with Collaborate in it; at 899px and below the hamburger menu shows Collaborate, Blog and Chat.
16. Clicking Collaborate from the portfolio opens the sign-in gate when signed out and the dashboard when signed in.

Under the checklist add the reminder: **after QA passes, update the portfolio's About text and project snippet in the admin panel** (the earlier suggestion was "Full-stack portfolio featuring a blog and real-time collaborative system design workspace").

## Verify when done

- [ ] `npm run build` passes at the repo root with no new warnings. Report the entry, `Collaborate` and `WorkspacePage` chunk sizes next to the S29b numbers. The entry chunk may grow only by the link markup.
- [ ] The built entry chunk contains no `@xyflow` text (invariant 8).
- [ ] `cd server && npm test` still passes 328.
- [ ] Each of the twelve root client suites passes in its own command, unchanged. Report each count.
- [ ] `git diff --check` passes.
- [ ] `git diff --stat` shows only this spec's allowed files on top of whatever S29a and S29b already changed.
- [ ] `Navbar.jsx`: exactly two new `Link` elements to `/collaborate`, exactly two breakpoint class changes, one comment update, and no import from `src/collaborate/`.
- [ ] Every folder and file named in the two readme trees exists (check each against the disk).
- [ ] No slice label matching `S[0-9]{2}` remains in `server/readme.md`.
- [ ] The Launch QA section is in the tracker with all sixteen lines marked not run.
- [ ] If you can run a browser locally: the navbar at 899px, 900px and 1080px. Otherwise record it as **not run**.

## Review checklist (for the reviewer)

Rerun every command above yourself. Then check:

1. The `Navbar.jsx` diff is only what section 1 allows, and the Blog and Chat links are byte-identical.
2. Nothing under `src/collaborate/`, `server/src/`, or any test changed in this slice.
3. Every feature claim added to `readme.md` is true of the code: check each of the six bullets against `context/1-project-overview.md`. Reject invented features (for example export, templates, AI, email delivery, simultaneous editing).
4. Every path in both readme trees exists on disk.
5. The `server/readme.md` diff changes wording and the tree only: no payload, status code, limit or example changed. Spot-check at least five edited sentences against the code.
6. The single-instance subsection says what section 3 lists and nothing more.
7. The Launch QA record marks nothing as passed, and no document says the product is launched or QA-verified. After this slice the correct status is: implemented and Approved, launch QA pending.
