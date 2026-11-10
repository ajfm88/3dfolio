# AI Workflow Rules

## Approach

Build `/collaborate` incrementally with a spec-driven workflow:

- The six context files define what to build and how.
- `specs/00-build-plan.md` defines the 30 slices and their order.
- `specs/NN-<name>.md` is the complete instruction set for one slice.
- `6-progress-tracker.md` records the actual state.

Implement exactly what the spec says, no more and no less. Don't infer or invent behavior.

Implementers are assigned slice by slice (Grok, Codex, Nemotron). Claude reviews by default, and the tracker records who reviewed each slice. The user assigns slices and commits.

## The Cycle

1. **Spec.** Claude writes `specs/NN-<name>.md` from the build plan just before the slice starts, so it reflects the code as it actually is. Don't start a slice without its spec file.
2. **Implement.** When the user assigns slice NN:
   - Read `specs/NN-<name>.md`.
   - Set the slice to **In progress** in `6-progress-tracker.md`.
   - Implement it exactly as specified, without going beyond its scope.
   - Run the verification below.
   - Set it to **Ready for review** and add a slice note: what changed, how you verified it, deviations.
   - Stop.
3. **Review.** Claude reviews the uncommitted diff against the spec's checklist, the invariants in `2-architecture.md`, and `4-code-standards.md`, and reruns the build and every test suite itself instead of relying on the slice note. Findings set the slice to **Changes requested**.
4. **Correct.** Fix only what the review lists. Don't change anything else.
5. **Approve and commit.** Claude marks the slice **Approved**. The user commits it. **Implementers never commit, push, or create branches.**

## Scoping Rules

- Work on one slice at a time. Never start the next slice in the same session.
- Only start a slice whose dependencies are **Approved** or **Committed** in the tracker.
- Make no speculative changes: no "while I'm here" refactors, renames, formatting sweeps, or dependency bumps.
- Don't combine unrelated system boundaries beyond what the spec names. A spec marked `both` names its server and client parts explicitly. Don't add more.

## When to Split Work

If the spec turns out to require any of the following, stop and record it as an open question instead of doing it:

- touching a file the spec doesn't name
- adding a dependency the spec doesn't list
- changing a socket event, payload, collection, or limit defined in `2-architecture.md`
- changing behavior of `/blog`, `/chat`, the portfolio, `/gft`, or the admin panel

If a slice can't be verified end to end in one session, the spec is too broad. Say so in the tracker, and Claude will split it.

## Handling Missing Requirements

- Don't invent product behavior that isn't defined in the context files or the spec.
- If a requirement is ambiguous, pick nothing. Add it to **Open Questions** in `6-progress-tracker.md` with the options you see, and stop if it blocks the slice.
- If you find a conflict between the spec and the context files, the context files win. Note the conflict in your slice note.

## Protected Files

Don't modify these unless the current slice's spec explicitly names them:

- `src/chat/**`, `src/blog/**`, `src/admin/**`, `src/components/**`, `src/pages/` other than `Collaborate.jsx`
- `server/src/controllers/{auth,post,comment,message}.controller.js`, `server/src/routes/{auth,post,comment,message}.route.js`, `server/src/models/{user,post,comment,message}.model.js`, `server/src/middleware/**`
- `server/src/lib/socket.js` (S01, S13, S20 only), `server/src/lib/imagekit.js` (S23 only), `server/src/webhooks/clerk.webhook.js` (S27 only), `server/src/index.js` (route mounting only)
- `src/App.jsx` (S04 only), `vite.config.js` and `package.json` (S07 only), `server/package.json` (S02 only), `src/components/Navbar.jsx` (S30 only)
- `.env`, `.env.example`, `server/.env*`, `vercel.json`, `tailwind.config.cjs`, `postcss.config.cjs`
- `node_modules/` and any third-party internals

## Keeping Docs in Sync

- Document new endpoints, socket events, and collections in `server/readme.md` in the same slice.
- If implementation forces a change to architecture, storage, standards, UI tokens, or scope, update the relevant context file **in the same slice**, and call it out in the slice note. Claude will check it.
- `6-progress-tracker.md` reflects the actual state, never the intended state.

## Local Verification

- Server: `cd server && npm install` (first time), then `npm run dev`, with `server/.env` holding the values Render uses.
- Frontend: `npm run dev`, with `.env` setting `VITE_API_URL=http://localhost:3000/api` while you work on server slices.
- Multi-user checks: a normal window plus an incognito window signed into a second Clerk account. Both accounts must already be synced to MongoDB.
- Until invitations ship (S26, S28), a second account can open a project only if it is added to that project's `members` by hand in MongoDB. Local runs also need `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` for the frontend, and `CLIENT_URL=http://localhost:5173` for the server.
- Test data goes to the database `MONGO_URI` names (see Q2 in the tracker). Collaborate only writes `projects`, `canvases`, and `projectmessages`.

## Before Moving to the Next Slice

1. Every item in the spec's "Verify when done" list is checked, with how you checked it written in the slice note.
2. `npm run build` passes at the repo root, with no new warnings from collaborate code.
3. `cd server && npm test` passes and finishes on its own, and each root client suite passes in its own command.
4. The server boots cleanly with `npm run dev`.
5. `/blog` loads posts, and `/chat` sends and receives a DM with typing and presence working.
6. No invariant in `2-architecture.md` was violated.
7. `server/readme.md` and any affected context files are updated.
8. `6-progress-tracker.md` shows the slice as **Ready for review** with its note.

## Prompts

**Implement** (user to agent):

```text
Read AGENTS.md and every file it lists, then context/specs/NN-<name>.md.
Mark slice NN In progress in context/6-progress-tracker.md.
Implement it exactly as specified. Do not go beyond the scope of this slice.
Run the verification in context/5-ai-workflow-rules.md, mark it Ready for review
with your slice note, and stop. Do not commit.
```

**Correct** (user to agent, from Claude's review):

```text
Review findings for slice NN: [paste findings].
Fix only these. Do not change anything else. Update the slice note and mark it Ready for review again.
```

**Close** (user, after Claude approves):

```text
Slice NN is approved. Commit it as <next number>. <summary>: with bullet points, matching the repo's history.
Follow the commit message rules in context/5-ai-workflow-rules.md.
```

## Commit Messages

These rules apply to every commit message, whoever drafts it (Claude, Grok, Codex, or the user):

- **Never use the double-quote character (`"`) anywhere in a commit message**: not in the subject, the bullets, code names, JSON, or quoted strings. Rephrase instead. For example, describe a script as: add an npm test script that runs node --test. Don't paste its JSON.
- Format: `<next number>. <summary>:`, then bullet points, matching the repo's history (`git log`).
- Number: the previous commit's number plus one.
