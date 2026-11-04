# Slice 06: Shared canvas ops module

**Lane:** server (pure) · **Depends on:** S02 · **Unblocks:** S07, S13, S14, S25

## Goal

One pure module that decides what a valid canvas is and how an op changes it. The server will use it to validate, persist, and broadcast commits (S14). The client will import the same file to apply ops optimistically (S07 onward). Because both sides run the same code, validation and application can't drift between implementers.

This slice is only that module and its tests. No route, no socket event, no store, no client file, no dependency.

## Design

```text
server/
├── readme.md                       ← edit: structure tree only
├── src/
│   └── shared/
│       └── canvasOps.js            ← new, zero imports
└── test/
    └── canvasOps.test.js           ← new
```

Nothing else changes. Don't edit `vite.config.js` (the `@shared` alias is S07), `package.json`, or any model.

### Why the module can have no imports

The browser bundles it through a Vite alias in S07, so it can't import `mongoose` or any Node built-in. Ids use `globalThis.crypto.randomUUID()`, which exists in browsers and in Node 19+. Neither `package.json` pins `engines`. Local Node is 24. Check the Node version in Render's build log or settings, and record it in the slice note. If it's below 19, stop and add an open question instead of shimming.

### Canonical shapes (from `2-architecture.md`, unchanged)

```js
node = { id, type: "shape", position: { x, y }, width, height,
         data: { label, shape, color, textColor } }
edge = { id, source, target, sourceHandle, targetHandle, type: "link", data: { label } }
```

Those are the only fields ever stored. Everything else on an input object is dropped.

### Exports

**Constants** (all deeply frozen with `Object.freeze`):

| Export | Value |
| --- | --- |
| `NODE_SHAPES` | `["rectangle", "diamond", "circle", "pill", "cylinder", "hexagon"]` |
| `HANDLE_IDS` | `["top", "right", "bottom", "left"]` |
| `NODE_COLORS` | the 8 pairs from `3-ui-context.md` → Node palette, as `[{ name, fill, text }]`, neutral first |
| `DEFAULT_NODE_COLOR` | `NODE_COLORS[0]`, the neutral pair |
| `DEFAULT_NODE_SIZE` | keyed by shape, each `{ width, height }`: rectangle 160×80, pill 160×64, circle 96×96, diamond 144×96, hexagon 144×96, cylinder 112×112 |
| `ID_PATTERN` | `/^[A-Za-z0-9_-]{1,64}$/` |
| `MAX_NODES`, `MAX_EDGES` | `300`, `600` |
| `MAX_OPS_PER_COMMIT` | `50` |
| `NODE_LABEL_MAX`, `EDGE_LABEL_MAX` | `200`, `100` |
| `NODE_SIZE_MIN`, `NODE_SIZE_MAX` | `40`, `2000` |
| `POSITION_MAX` | `100000` |

The default sizes are a design decision made in this spec, because no earlier doc fixes them. S08 uses them for the drop.

Hex values may appear in this file (the node palette is one of the places `3-ui-context.md` allows them).

**Functions** (all pure: no clock, no I/O, no mutation of inputs, never throw on bad input):

- `createNodeId()` → `"n_" + crypto.randomUUID()`. `createEdgeId()` → `"e_" + crypto.randomUUID()`. Both always match `ID_PATTERN`.
- `sanitizeNode(raw, options?)` → `{ ok: true, node } | { ok: false, error }`
- `sanitizeEdge(raw, options?)` → `{ ok: true, edge } | { ok: false, error }`
- `applyOps(canvas, ops)` → `{ ok: true, canvas, ops } | { ok: false, error, index }`
- `normalizeCanvas(raw)` → `{ nodes, edges }`

`invertOps` is S25's. Don't add it.

### `sanitizeNode(raw, { truncate = false })`

Rebuilds a node field by field. Anything that isn't listed is dropped.

- `raw` must be a plain object (not `null`, not an array). Otherwise `{ ok: false, error: "Node must be an object" }`.
- `id`: string matching `ID_PATTERN`.
- `type`: not read from `raw`. The output is always `"shape"`.
- `position.x`, `position.y`: finite numbers with `|n| ≤ POSITION_MAX`. `NaN`, `Infinity`, numeric strings, and booleans are invalid.
- `width`, `height`: finite numbers in `[NODE_SIZE_MIN, NODE_SIZE_MAX]`. Fractions are allowed, because resizing produces them.
- `data` must be an object. `data.shape` must be in `NODE_SHAPES`.
- `data.label`: a string, default `""` when absent. Longer than `NODE_LABEL_MAX` is an error, unless `truncate` is true, in which case it's cut to the limit. Not a string is an error either way.
- `data.color`, `data.textColor`: strings matching `/^#[0-9A-Fa-f]{6}$/`, stored uppercase. When absent, they default to the neutral pair. Any `#RRGGBB` is accepted, not only palette entries, per the Limits table. The palette is for the UI.
- Errors name the field, e.g. `"Node width must be between 40 and 2000"`. The client toasts them, so write them as plain sentences.

### `sanitizeEdge(raw, { truncate = false })`

- `raw` must be a plain object.
- `id`, `source`, `target`: strings matching `ID_PATTERN`.
- `sourceHandle`, `targetHandle`: one of `HANDLE_IDS`, or `null`. `undefined` becomes `null`. Anything else is an error.
- `type`: not read. Always `"link"`.
- `data.label`: a string, default `""`. Longer than `EDGE_LABEL_MAX` is an error (cut when `truncate`). `data` missing is fine.
- It does not check that `source` and `target` exist. That needs the canvas, so `applyOps` and `normalizeCanvas` do it.
- Self-loops (`source === target`) and several edges between the same pair are **allowed**. The architecture doesn't forbid them, and this spec doesn't invent a rule. S12 decides how `LinkEdge` draws a self-loop; record it in the tracker as a carry-forward (see below).

### `applyOps(canvas, ops)`

`canvas` is `{ nodes, edges }`. Extra keys (`version`, `_id`, and so on) are ignored and not copied. A non-array `nodes` or `edges` is treated as `[]`.

**Batch checks**, before any op runs:

- `ops` must be an array, else `{ ok: false, error: "Ops must be a list", index: -1 }`.
- Length 0 → `"Nothing to apply"`. Length over `MAX_OPS_PER_COMMIT` → `"Too many changes at once"`. Both with `index: -1`.

**Application.** Ops apply in order against a working copy, so op 3 can touch a node op 1 added. The first invalid op ends the whole call with `{ ok: false, error, index }`, where `index` is the op's position. **Nothing is partially applied**: on failure the caller gets no canvas. This is the atomicity rule from the architecture.

Every op must be a plain object with a known string `type`. Unknown types are an error (`"Unknown change type"`).

| Op | Rules | Normalized op returned |
| --- | --- | --- |
| `node.add { node }` | `sanitizeNode(node)` passes. Id isn't already used by a node. Node count after adding ≤ `MAX_NODES`. | `{ type, node }` with the sanitized node |
| `node.update { id, patch }` | `id` is a valid, existing node id. `patch` is an object. Recognized keys only: `position` (both `x`,`y` required, each valid), `width`, `height`, and `data` with any of `label`, `shape`, `color`, `textColor`. Unknown keys, at any level, are dropped. If nothing recognized remains, error `"Nothing to change"`. Each present value is validated as in `sanitizeNode`. The merged result must pass `sanitizeNode`. | `{ type, id, patch }` where `patch` holds only the recognized keys that were supplied |
| `node.remove { id }` | `id` exists. Removes the node and **every edge whose `source` or `target` is that id**. | `{ type, id }` (receivers cascade for themselves) |
| `edge.add { edge }` | `sanitizeEdge(edge)` passes. Id isn't already used by an edge. `source` and `target` exist **in the working copy at that point**. Edge count after adding ≤ `MAX_EDGES`. | `{ type, edge }` with the sanitized edge |
| `edge.update { id, patch }` | `id` exists. Recognized: `patch.data.label` only (string, ≤ `EDGE_LABEL_MAX`). Nothing recognized → `"Nothing to change"`. | `{ type, id, patch: { data: { label } } }` |
| `edge.remove { id }` | `id` exists. | `{ type, id }` |

A `node.update` patch can't change `id` or `type`; those keys are simply dropped like any other unknown key.

**Output.** `{ ok: true, canvas: { nodes, edges }, ops: normalizedOps }`. `ops` has one entry per input op, in order, and **the server broadcasts these, not the raw input** (invariant 5). The returned arrays and objects are new: the output never shares a reference with the input, and the input is never mutated (tests freeze it deeply).

**Lookups.** Don't use `id in obj` or plain-object maps keyed by ids. Ids like `__proto__` and `constructor` match `ID_PATTERN`. Use `Map` or `Set`, and a test covers both ids.

### `normalizeCanvas(raw)`

Rebuilds stored data into canonical shape on every load. Never throws.

- `raw` not an object → `{ nodes: [], edges: [] }`. `nodes` or `edges` not an array → `[]` for that side.
- Nodes: run `sanitizeNode(n, { truncate: true })` on each. Drop failures. Drop later duplicates of an id (first wins). Stop at `MAX_NODES`.
- Edges: run `sanitizeEdge(e, { truncate: true })` on each. Drop failures, duplicates (first wins), and edges whose `source` or `target` isn't among the kept nodes. Stop at `MAX_EDGES`.
- Returns `{ nodes, edges }` only. `version` stays the caller's.

## Implementation

### `server/src/shared/canvasOps.js` (new)

- ESM, **zero imports**, JavaScript. A header comment says in full sentences why the file has no imports and why it sits in `shared/` (the client bundles it, so it must run in a browser; one copy keeps both sides identical).
- Keep helpers private (`isPlainObject`, `isFiniteInRange`, and so on). Export only what the tables above list.
- Comments explain why, not what, in the repo's voice (see `projectAccess.js`). Name where the numbers come from: the Limits table in `2-architecture.md`.
- Don't read the clock or `Math.random`. Don't log.
- Plain object means `Object.prototype.toString.call(x) === "[object Object]"`. This accepts lean Mongoose subdocuments and rejects arrays, `null`, and primitives.

### `server/test/canvasOps.test.js` (new)

Use `node:test` and `node:assert/strict`, the same style as `projectAccess.test.js`. No database, no network, no timers.

- **Constants:** frozen (assigning throws in strict mode, or `Object.isFrozen`), 8 colors with neutral first, every shape has a default size inside the allowed range, `ID_PATTERN` accepts and rejects the right strings.
- **Ids:** `createNodeId()` and `createEdgeId()` match `ID_PATTERN`, have the right prefix, and 1,000 calls give no duplicates.
- **`sanitizeNode`:**
  - a valid node round-trips, `type` is forced to `"shape"`, extra fields at the top and in `data` are dropped
  - a missing label becomes `""`, missing colors become the neutral pair, and `#abc123` becomes `#ABC123`
  - each invalid field fails with an error naming it: bad id, `NaN`/`Infinity`/string coordinates, `|x|` just over the limit (and exactly at it passes), width 39 and 2001 (40 and 2000 pass), unknown shape, 201-character label (200 passes), non-string label, color `red`, `#fff`, `#GGGGGG`
  - `truncate: true` cuts a long label and still rejects other bad fields
  - `null`, `[]`, `"x"`, and `5` as input fail without throwing
- **`sanitizeEdge`:** valid round-trip, `type` forced to `"link"`, undefined handles become `null`, every handle id accepted, an invalid handle rejected, label 100 passes and 101 fails, missing `data` is fine, self-loop accepted, bad ids rejected.
- **`applyOps`, per op:**
  - add / update / remove for nodes and edges, valid and invalid, including `node.update` of each recognized key alone and merged `data` patches that keep unspecified `data` fields
  - `node.update` with only unknown keys → `"Nothing to change"`; with `id` or `type` in the patch, those are ignored; `position` with only `x` is invalid
  - `node.remove` cascades: edges where the node is the source and edges where it's the target both disappear, and unrelated edges stay
  - duplicate node id, duplicate edge id, edge to a missing node, update/remove of a missing id
  - an edge added after the node it needs in the same batch works; before it, it fails
- **`applyOps`, batch rules:**
  - non-array, empty, and 51-op batches fail with `index: -1`, and 50 ops pass
  - **atomicity:** a batch of 5 valid ops plus 1 invalid one returns `ok: false` with the right `index`, and the original canvas is unchanged
  - unknown op type, non-object op, missing `type`
  - the node limit: filling to 300 passes and the 301st `node.add` fails. The same for edges at 600 (build the 300 nodes and 600 edges in the test)
  - normalized ops contain only whitelisted fields (add a rogue field to every op and assert it's gone), and are fresh objects
  - input is not mutated: deep-freeze the canvas and the ops, call `applyOps`, expect no throw and the same output as on unfrozen copies
  - the output shares no reference with the input (mutating the result doesn't change the input)
  - ids `__proto__` and `constructor` work as normal ids for nodes and edges, and don't pollute `Object.prototype`
  - a canvas with extra keys (`version`, `_id`) returns only `{ nodes, edges }`
- **`normalizeCanvas`:** non-object input, non-array fields, invalid nodes dropped, duplicate ids first-wins, edges with a missing endpoint dropped, an edge to a node that was itself dropped is dropped too, long labels truncated, truncation at 300 nodes / 600 edges, extra keys stripped, and `version` not returned. Idempotent: `normalizeCanvas(normalizeCanvas(x))` deep-equals `normalizeCanvas(x)`.
- **No imports in the module:** read the source file with `fs` in one test and assert it has no `import` statement or `require(` call.

### `server/readme.md` (edit)

Update the structure tree only: add `shared/canvasOps.js` and `test/canvasOps.test.js`, with one-line descriptions in the style of the existing entries. No API or Socket.io table changes (nothing is exposed yet).

### Tracker

Per the cycle: set S06 to **In progress** at the start and **Ready for review** at the end, with a slice note. Also add this carry-forward to the S12 line of the notes: "S06 allows self-loops and parallel edges; decide how `LinkEdge` draws them, or add a rule to `canvasOps.js` through a spec change."

## Dependencies

None to install. Node 20+ global `crypto`.

## Verify when done

- [ ] `cd server && npm test` passes, with `canvasOps.test.js` included and the S02/S03 tests (67) still passing.
- [ ] `node --check server/src/shared/canvasOps.js` passes, and the file has zero `import` statements.
- [ ] Every export in the tables exists, and nothing extra is exported.
- [ ] Atomicity is demonstrated by a test: a batch with one bad op in the middle changes nothing.
- [ ] No input is mutated: the deep-freeze tests pass.
- [ ] `import` the module in a plain `node -e` one-liner and run one `applyOps` call by hand, to confirm it loads outside the test runner.
- [ ] Root `npm run build` passes (nothing imports the module yet, so this is a regression check only).
- [ ] The server boots with `npm run dev` (no new import path touches it, so this is a regression check only).
- [ ] `git diff` shows changes only in the files named under Design, plus the tracker. No other file is modified.
- [ ] `server/readme.md` structure tree updated; no API or Socket.io table changed.
- [ ] `6-progress-tracker.md` shows S06 as **Ready for review** with its slice note.
