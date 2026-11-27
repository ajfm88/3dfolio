## Application Building Context

This repo is building `/sysdesign` (code in `src/collaborate/`), a turn-based collaborative system-design workspace, slice by slice. Before implementing anything or making any architectural decision, read these files in order:

1. `context/1-project-overview.md`: product definition, goals, features, and scope
2. `context/2-architecture.md`: stack, system boundaries, storage model, socket protocol, and invariants
3. `context/3-ui-context.md`: theme tokens, typography, radius, and layout patterns
4. `context/4-code-standards.md`: implementation rules and conventions
5. `context/5-ai-workflow-rules.md`: the slice cycle, scoping rules, protected files, and verification
6. `context/6-progress-tracker.md`: current phase, slice status, open questions, and decisions

Then read the spec for your slice: `context/specs/NN-<name>.md`. The build order is in `context/specs/00-build-plan.md`.

Update `context/6-progress-tracker.md` after each meaningful implementation change.

If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.

Current handoff: `context/HANDOFF.md`, updated on 2026-11-26. All `/collaborate` work (S01 to S33) is committed through `69bc3e7` (commit 71, 2026-11-15). Launch QA on the deployed site is the user's and is **not run**, so the workspace is not recorded as launched. `/blog` and `/chat` stay in the app: the user cancelled their removal on 2026-11-14. The drawDB track is complete: D1 to D9 are committed as 72 to 80 (D9 is `65a692b`), and the user reported on 2026-11-24 that the D9 Vercel preview checklist passed. A follow-up batch from 2026-11-24, planned as commits 81 to 84, was committed by the user as one commit, 81 (`952d335`, 2026-11-25): D10 syncs the updated upstream drawDB, D11 stops the editor root from saving a duplicate diagram, D12 moves drawDB from `/drawdb` to `/dbdesign`, S34 (`context/specs/34-sysdesign-route.md`) moves the workspace from `/collaborate` to `/sysdesign`, and D13 refreshes these docs. Commit 82 (`805f39b`, 2026-11-26) adds dbdesign sign-in and cloud diagrams (cloud track slices C1 and C2). Only the URLs changed: folders, files and names in the code still say `collaborate` and `drawdb`, and `vercel.json` redirects the old paths. Recheck git and the tracker before starting anything.

Never commit, push, or create branches. The user assigns implementers/reviewers and handles commits. On 2026-11-14 Claude Fable 5.2 wrote the S29a, S29b and S30 specs, Grok implemented S29a and S29b, Codex implemented S30, and Nemotron reviewed all three; historical assignments and review notes remain valid history.

For the drawDB track, read `../3dfolio_drawdb_plan.md` first and follow its rules: it names every root file a D slice may edit (including `.gitignore`, `package.json`, `vercel.json` and `readme.md`), and one D slice is done per session, at a pace of one slice per day (the user, 2026-11-15). The user had the 2026-11-24 batch (D10 to D13 and S34) done in one session. Each D slice also has a spec in `../3dfolio_drawdb_specs/`; where the spec is more detailed than the plan, the spec wins. The drawDB track keeps its status in the plan's section 8 table, not in `context/6-progress-tracker.md`. For other work unrelated to `/collaborate` (portfolio, blog, chat, admin), follow the existing code, `readme.md`, and `server/readme.md`. The protected-file rules in `context/5-ai-workflow-rules.md` still apply while a `/collaborate` slice is in progress.

The dbdesign cloud track (accounts, cloud storage, versions, sharing, members) is planned in `../3dfolio_dbcloud_plan.md` with specs in `../3dfolio_dbcloud_specs/`, and follows that plan's rules.
