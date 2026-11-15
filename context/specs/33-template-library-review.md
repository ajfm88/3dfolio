# S33 — Template library: Review

**Reviewer:** Claude Sonnet 5.5
**Date:** 2026-11-14
**Status:** Approved

## Summary

S33 brings the library to twenty-seven templates in seven groups and makes the dialog show one group at a time. I found no blocking defects. Every command in the spec's "Verify when done" list passes when I run it myself. The slice note claims no browser check that was not run. A few non-blocking documentation and formatting notes are at the end.

## Verification (rerun by the reviewer)

| Command | Result |
| --- | --- |
| `node --test test/canvasTemplates.test.mjs` | **14 passed** (baseline 12) |
| Twelve other root suites, one command each | workspaceSync 13, turnState 10, turnRobustness 28, projectChatUi 5, projectChat 14, participants 6, mobileA11y 13, membershipUi 21, cursorPresence 69, canvasShortcuts 44, canvasPreview 39, canvasHistory 31 = **293 passed**, 0 failed, 0 skipped |
| `cd server && npm test` | **328 passed**, 0 failed, exited on its own |
| `npm run build` | Passed with only the existing >500 kB chunk warning. Entry **578.23 kB** (unchanged), `Collaborate` **24.06 kB** (unchanged), `WorkspacePage` **367.66 kB** (was 340.39 kB; growth is template data plus dialog code) |
| `git diff --check` | No output apart from LF/CRLF notices |
| `canvasTemplates.js` imports | One import line, from `@shared/canvasOps.js` |
| Raw hex in `TemplatesDialog.jsx` | None |
| Search of `src/` and `readme.md` for `Alex Xu`, `System Design Interview`, `YouTube`, `Google Drive`, `Google Maps` | No matches |
| Search of `src/` and `test/` for `system-design` | No matches |

Total 635 tests: 14 + 293 + 328.

## Review checklist

1. **Fingerprint function and table: pass.** The function at `test/canvasTemplates.test.mjs:25-29` hashes the same fields in the same order as the one in `specs/32-more-starter-templates.md` (section 4): id, name, description, group, node tuples, edge tuples, `.slice(0, 16)`. Only whitespace differs (`=(t)` and indentation). I extracted the 27 expected rows from the test and compared them to the table in section 4 of the spec. Id, group, node count, edge count, labelled-edge count and fingerprint all match. The test asserts every template against the table, so it proves all twenty-seven match.
2. **S32 templates changed only by `group`: pass.** The ids test fixes the order of all 27, so the first eleven keep their positions. The eight moved templates carry the new fingerprints, which differ from S32's only through `group`. Their other content is implied by the fingerprint, which covers every field.
3. **Helpers unchanged: pass, with a limit on the evidence.** `canvasTemplates.js` is untracked, so there is no git baseline to diff against. `freezeDeep`, `TEMPLATE_GAP`, `sizeOf`, `boxOf`, `templateBounds` and `buildTemplateOps` match S32's description in `32-more-starter-templates-review.md` (the label check in `templateBounds`, `edge.label ?? ""` in `buildTemplateOps`). I also rely on the implementer's snapshot comparison in the tracker. The unchanged builder tests pass for all 27.
4. **Dialog: pass.** `TemplatesDialog.jsx` matches section 3: the `initialGroup` prop and `useState` fallback, the `role="group"` row with `aria-pressed` pills, one keyed scroll container with `mt-4`, one section with the `h3` and that group's cards. `TemplatePreview`, the card markup and Close with `data-autofocus` are unchanged. No `useEffect` or new listener. `ShapePanel.jsx` has no group wiring. I did not diff `Dialog.jsx`, `EmptyCanvasHint.jsx`, the store or `mobileA11y.test.mjs` against a baseline, because the tree is uncommitted. The suites pass unchanged and the slice note records them as untouched.
5. **No forbidden strings: pass.** Searches are empty. Names and descriptions use generic component names.
6. **No server or dependency change: pass.** No server file is touched by this slice, and the build and tests ran without a dependency change.
7. **Slice note honesty: pass.** All eight manual checks are recorded as **not run**, and the note says static markup does not run group clicks, the insert handler or `fitBounds`.

## Invariants and standards

Invariants 3, 4, 5 and 8 hold: templates are client data inserted as ordinary ops through one `dispatch`, so one template is one commit and one undo frame, and the module imports only from `@shared/canvasOps.js`. Invariant 9 holds: no import from `src/chat/` or `src/blog/`. Styling uses `--collab-*` tokens, no hex or palette colors. No new dependency.

The tests also cover section 4 items 4 to 10: structure and the 40-unit spacing and origin rules for every non-`patterns` template, builder behaviour for all 27, default and per-group markup with one pressed button, the unknown-group fallback, and the closed dialog.

## Non-blocking notes

1. **Formatting.** The dialog JSX mixes indentation (the group buttons and list are indented less than their surroundings), and the new tests are written as dense one-liners. Behaviour is unaffected. Reformat if the user wants consistency.
2. **Stale S32 line in `3-ui-context.md`.** The `### S32` section still says the dialog shows two groups and eleven cards in one scrolling list. The `### S33` section below it supersedes it. A short "superseded by S33" note would avoid confusion.
3. **Tracker leftovers.** The tracker's `Current Phase` and `Current Goal` still say no `/collaborate` slice remains, and the S33 notes about a stopped verification and a pending checkpoint are historical, though they are labelled as such. `AGENTS.md` does not mention S32 or S33. I changed only the S33 status lines, as asked.
4. **`HANDOFF.md` still says S33 is Ready for review.** I left it alone, since you asked for the tracker only. The user or the next session can update it.

## Not verified

The eight manual checks stay **not run**, including real-font label fit, the Web Crawler return edge, keyboard use of the group buttons, focus trapping, reopening state, scroll reset, undo and redo with a watcher, and the 320px layout. Approval is code approval, not runtime verification.

**Slice status: Approved.**
