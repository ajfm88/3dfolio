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

Current handoff: `context/HANDOFF.md`, reconciled on 2026-11-13. S01–S26 are committed through HEAD `c14a185` (commit 69). The last independent baseline is 542 passing tests plus build/diff check, with manual/live QA still open. Today's plan is two slices, S27 then S28. S27 (`context/specs/27-live-membership-enforcement.md`) is Approved and uncommitted; S28 (`context/specs/28-share-dialog-invitations-ui.md`) is Approved and uncommitted. S29 is next and not yet specified. Recheck git and the tracker before starting any slice.

Never commit, push, or create branches. The user assigns implementers/reviewers and handles commits. For S27/S28, GPT 6.1 Terra implements and Claude Opus 5.5 specifies and reviews, as assigned on 2026-11-13; historical assignments and review notes remain valid history.

For work unrelated to `/collaborate` (portfolio, blog, chat, admin), follow the existing code, `readme.md`, and `server/readme.md`. The protected-file rules in `context/5-ai-workflow-rules.md` still apply while a slice is in progress.
