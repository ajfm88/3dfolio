## Application Building Context

This repo is building `/collaborate`, a turn-based collaborative system-design workspace, slice by slice. Before implementing anything or making any architectural decision, read these files in order:

1. `context/1-project-overview.md`: product definition, goals, features, and scope
2. `context/2-architecture.md`: stack, system boundaries, storage model, socket protocol, and invariants
3. `context/3-ui-context.md`: theme tokens, typography, radius, and layout patterns
4. `context/4-code-standards.md`: implementation rules and conventions
5. `context/5-ai-workflow-rules.md`: the slice cycle, scoping rules, protected files, and verification
6. `context/6-progress-tracker.md`: current phase, slice status, open questions, and decisions

Then read the spec for your slice: `context/specs/NN-<name>.md`. The build order is in `context/specs/00-build-plan.md`.

Update `context/6-progress-tracker.md` after each meaningful implementation change.

If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.

Current handoff: `context/HANDOFF.md`, reconciled on 2026-11-15. All `/collaborate` work is committed through HEAD `69bc3e7` (commit 71, 2026-11-15): the 30 slices of the build plan plus S31, S32 and S33, the starter templates (twenty-seven templates in seven groups; specs 31 to 33 in `context/specs/`). Launch QA on the deployed site is the user's and is **not run**, so `/collaborate` is not recorded as launched. `/blog` and `/chat` stay in the app: the user cancelled their removal on 2026-11-14. No `/collaborate` slice is open. The current work is the separate drawDB track: D1 is committed as 72 (`c30df64`); D2 is committed as 73 (`c78e20f`) and the user reported the Vercel preview check passed on 2026-11-17; D3 is committed as 74 (`c825533`); D4 is committed as 75 (`a2ab54c`); D5 (contexts and hooks) is committed as 76 (`978b101`). D6 (templates gallery) is committed as 77 (`36c1319`), and its Vercel preview check passed (user, 2026-11-21). D7 (editor building blocks and side panel) is committed as 78 (`f8e2f13`). D8 (editor canvas) is Approved by Grok on 2026-11-22 and uncommitted for commit 79, from `../3dfolio_drawdb_specs/D8-editor-canvas.md` and `../3dfolio_drawdb_specs/D8-editor-canvas-review.md`. Recheck git and the tracker before starting anything.

Never commit, push, or create branches. The user assigns implementers/reviewers and handles commits. On 2026-11-14 Claude Fable 5.2 wrote the S29a, S29b and S30 specs, Grok implemented S29a and S29b, Codex implemented S30, and Nemotron reviewed all three; historical assignments and review notes remain valid history.

For the drawDB track, read `../3dfolio_drawdb_plan.md` first and follow its rules: it names every root file a D slice may edit (including `.gitignore`, `package.json`, `vercel.json` and `readme.md`), and one D slice is done per session, at a pace of one slice per day (the user, 2026-11-15). Each D slice also has a spec in `../3dfolio_drawdb_specs/`; where the spec is more detailed than the plan, the spec wins. The drawDB track keeps its status in the plan's section 8 table, not in `context/6-progress-tracker.md`. For other work unrelated to `/collaborate` (portfolio, blog, chat, admin), follow the existing code, `readme.md`, and `server/readme.md`. The protected-file rules in `context/5-ai-workflow-rules.md` still apply while a `/collaborate` slice is in progress.
