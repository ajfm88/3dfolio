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

Current handoff: `context/HANDOFF.md`, reconciled after the final S26 review on 2026-11-12. S01–S24 are committed on HEAD `9b47c77` (commit 68). S25 and S26 are Approved and uncommitted; preserve both and their planning/review documents. The final independent baseline is 542 passing tests plus build/diff check, with manual/live QA still open. The user requested stopping after S26 review: do not plan/specify/implement S27 today. No S27 spec exists. Recheck git and the tracker when the user resumes.

Never commit, push, or create branches. The user assigns implementers/reviewers and handles commits. For S25/S26, Claude Sonnet implements and Codex specifies/reviews, as assigned on 2026-11-12; historical assignments and review notes remain valid history.

For work unrelated to `/collaborate` (portfolio, blog, chat, admin), follow the existing code, `readme.md`, and `server/readme.md`. The protected-file rules in `context/5-ai-workflow-rules.md` still apply while a slice is in progress.
