# Slice 33 — Template library: sixteen more templates and a group filter

**Execution status (2026-11-14): Todo.** Spec written; implementation not started.

**Lane** client · **Depends on** S32 (Approved; its `canvasTemplates.js`, `TemplatesDialog.jsx` and `canvasTemplates.test.mjs` must be in the tree) · **Unblocks** nothing

**Spec author** Claude Fable 5.2 · **Implementer / Reviewer** assigned by the user

## Why this slice exists

S31 added three starter templates and S32 eight more. On 2026-11-14 the user chose sixteen further topics, all of the candidates offered, from the remaining chapters of the two *System Design Interview* books. This slice adds them, which brings the library to twenty-seven.

Twenty-seven cards in one scrolling list is too long, so the slice also regroups the library into seven groups and makes the dialog show one group at a time.

| # | Template id | Name shown | Group |
| --- | --- | --- | --- |
| 1 | `unique-id-generator` | Unique ID Generator | Web foundations |
| 2 | `nearby-friends` | Nearby Friends | Social and messaging |
| 3 | `email-service` | Email Service | Social and messaging |
| 4 | `object-storage` | Object Storage | Media and storage |
| 5 | `web-crawler` | Web Crawler | Search and location |
| 6 | `search-autocomplete` | Search Autocomplete | Search and location |
| 7 | `proximity-service` | Proximity Service | Search and location |
| 8 | `maps-navigation` | Maps and Navigation | Search and location |
| 9 | `payment-system` | Payment System | Payments and booking |
| 10 | `digital-wallet` | Digital Wallet | Payments and booking |
| 11 | `hotel-reservation` | Hotel Reservation | Payments and booking |
| 12 | `stock-exchange` | Stock Exchange | Payments and booking |
| 13 | `distributed-message-queue` | Distributed Message Queue | Data and streaming |
| 14 | `metrics-monitoring` | Metrics Monitoring | Data and streaming |
| 15 | `ad-click-aggregation` | Ad Click Aggregation | Data and streaming |
| 16 | `realtime-leaderboard` | Real-time Leaderboard | Data and streaming |

Each diagram is our own high-level drawing of the topic with standard component names. Nothing is copied from the books: no figure, layout, numbering or wording. Do not add the books' title, the author's name, or the product names YouTube, Google Drive or Google Maps to any template name, description, label or UI text.

It is an addition in Phase L of `00-build-plan.md`. It does not block the launch QA or the drawDB track.

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, `specs/32-more-starter-templates.md`, and this spec. Recheck `git status` and `git log -3`. S29a to S32 may be committed or still uncommitted; either way, change none of their files except the ones this spec names.

Baseline from the S32 review: server suite **328**; twelve root client suites **293** plus `canvasTemplates` **12**; production build passing with entry 578.23 kB, `Collaborate` 24.06 kB, `WorkspacePage` 340.39 kB.

Three things change in code, and nothing else:

1. **Groups.** `TEMPLATE_GROUPS` becomes seven groups, and the eight S32 templates move from `system-design` into three of them.
2. **Data.** Sixteen templates appended to `CANVAS_TEMPLATES`.
3. **Dialog.** A row of group buttons; only the chosen group's cards are rendered.

The template format, `templateBounds`, `buildTemplateOps` and the insertion path are untouched. `ShapePanel.addTemplate` still makes one `dispatch(built.ops)` call, so one template is one commit, one broadcast and one undo frame. The largest template is still 26 ops (limit 50).

No server file changes. No new dependency. No change to `ShapePanel.jsx`, `EmptyCanvasHint.jsx`, `Dialog.jsx`, `WorkspaceCanvas.jsx`, the store, or `test/mobileA11y.test.mjs`.

Mark S33 In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy. **Do not end your turn between those steps**: if a step fails, report its exact output; otherwise carry on to Ready for review.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/lib/canvasTemplates.js` | New `TEMPLATE_GROUPS`, new `group` on eight existing templates, sixteen new templates |
| `src/collaborate/components/canvas/TemplatesDialog.jsx` | Group buttons and one visible group |
| `test/canvasTemplates.test.mjs` | Updated and new tests (section 4) |
| `readme.md` | One feature bullet reworded |
| `context/1-project-overview.md`, `context/2-architecture.md`, `context/3-ui-context.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md`, `context/specs/00-build-plan.md` | Documentation |

Everything else stays unchanged. If the work seems to need another file, stop and record an open question in the tracker.

## 1. `lib/canvasTemplates.js`: groups

Replace `TEMPLATE_GROUPS` with exactly this:

```js
export const TEMPLATE_GROUPS = freezeDeep([
  { id: "patterns", title: "Architecture patterns" },
  { id: "foundations", title: "Web foundations" },
  { id: "social", title: "Social and messaging" },
  { id: "media-storage", title: "Media and storage" },
  { id: "search-location", title: "Search and location" },
  { id: "payments", title: "Payments and booking" },
  { id: "data", title: "Data and streaming" },
]);
```

The group id `system-design` no longer exists. Change the `group` value of the eight S32 templates, and **nothing else in them**:

| Template | New `group` |
| --- | --- |
| `scale-to-millions`, `rate-limiter`, `url-shortener` | `foundations` |
| `news-feed`, `chat-system`, `notification-system` | `social` |
| `video-streaming`, `cloud-file-storage` | `media-storage` |

The three `patterns` templates are not touched at all. Do not reorder the existing eleven entries in the array.

## 2. `lib/canvasTemplates.js`: the sixteen new templates

Append these sixteen objects to the `CANVAS_TEMPLATES` array, after `notification-system`, in this order. Copy the block as it is. The file's formatting is free, but every value is fixed: ids, names, groups, descriptions, keys, labels, shapes, colors, coordinates, sizes, edge order, handles and edge labels. Do not round, re-center, rename or reorder anything. The fingerprint test in section 4 fails on any difference.

The format is S32's. A node without `width` and `height` uses `DEFAULT_NODE_SIZE[shape]`.

```json
  {
    "id": "unique-id-generator",
    "name": "Unique ID Generator",
    "group": "foundations",
    "description": "App servers ask any generator node for an ID. A coordination service gives each node its own worker number, so IDs never collide and stay sortable by time.",
    "nodes": [
      { "key": "apps", "label": "App Servers", "shape": "rectangle", "color": "Blue", "x": 0, "y": 156 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 140, "width": 176, "height": 112 },
      { "key": "gen1", "label": "ID Generator 1", "shape": "rectangle", "color": "Teal", "x": 520, "y": 0 },
      { "key": "gen2", "label": "ID Generator 2", "shape": "rectangle", "color": "Teal", "x": 520, "y": 156 },
      { "key": "gen3", "label": "ID Generator 3", "shape": "rectangle", "color": "Teal", "x": 520, "y": 312 },
      { "key": "coord", "label": "Coordination Service", "shape": "rectangle", "color": "Green", "x": 820, "y": 156 }
    ],
    "edges": [
      { "from": "apps", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "gen1", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "gen2", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "gen3", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gen1", "to": "coord", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gen2", "to": "coord", "sourceHandle": "right", "targetHandle": "left", "label": "worker ID" },
      { "from": "gen3", "to": "coord", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "nearby-friends",
    "name": "Nearby Friends",
    "group": "social",
    "description": "Phones send location updates over WebSocket. The servers keep the latest position in a cache, publish it to friends through pub/sub channels, and append it to a history store.",
    "nodes": [
      { "key": "client", "label": "Mobile Clients", "shape": "pill", "color": "Blue", "x": 0, "y": 164 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 140, "width": 176, "height": 112 },
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 560, "y": 16 },
      { "key": "userDb", "label": "User DB", "shape": "cylinder", "color": "Neutral", "x": 864, "y": 0 },
      { "key": "ws", "label": "WebSocket Servers", "shape": "rectangle", "color": "Teal", "x": 560, "y": 296 },
      { "key": "pubsub", "label": "Pub/Sub Channels", "shape": "hexagon", "color": "Orange", "x": 848, "y": 208 },
      { "key": "cache", "label": "Location Cache", "shape": "cylinder", "color": "Pink", "x": 848, "y": 368 },
      { "key": "history", "label": "Location History", "shape": "cylinder", "color": "Neutral", "x": 576, "y": 480, "width": 128, "height": 112 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "api", "sourceHandle": "right", "targetHandle": "left", "label": "HTTP" },
      { "from": "lb", "to": "ws", "sourceHandle": "right", "targetHandle": "left", "label": "WebSocket" },
      { "from": "api", "to": "userDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "ws", "to": "pubsub", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "ws", "to": "cache", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "ws", "to": "history", "sourceHandle": "bottom", "targetHandle": "top", "label": "append" }
    ]
  },
  {
    "id": "email-service",
    "name": "Email Service",
    "group": "social",
    "description": "Web servers read mail from the store and queue outgoing mail for the SMTP senders. Incoming mail passes through a queue and spam and virus checks before it is stored.",
    "nodes": [
      { "key": "outQ", "label": "Outgoing Queue", "shape": "hexagon", "color": "Orange", "x": 788, "y": 0 },
      { "key": "smtpOut", "label": "SMTP Outgoing", "shape": "rectangle", "color": "Green", "x": 1040, "y": 8 },
      { "key": "client", "label": "Webmail Client", "shape": "pill", "color": "Blue", "x": 0, "y": 216 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 192, "width": 176, "height": 112 },
      { "key": "web", "label": "Web Servers", "shape": "rectangle", "color": "Teal", "x": 520, "y": 208 },
      { "key": "store", "label": "Mail Store", "shape": "cylinder", "color": "Neutral", "x": 804, "y": 192 },
      { "key": "external", "label": "Other Mail Servers", "shape": "rectangle", "color": "Pink", "x": 1300, "y": 208 },
      { "key": "proc", "label": "Mail Processing", "shape": "rectangle", "color": "Green", "x": 780, "y": 408 },
      { "key": "inQ", "label": "Incoming Queue", "shape": "hexagon", "color": "Orange", "x": 1048, "y": 400 },
      { "key": "smtpIn", "label": "SMTP Incoming", "shape": "rectangle", "color": "Green", "x": 1300, "y": 408 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "web", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "web", "to": "outQ", "sourceHandle": "top", "targetHandle": "left", "label": "send" },
      { "from": "outQ", "to": "smtpOut", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "smtpOut", "to": "external", "sourceHandle": "right", "targetHandle": "top" },
      { "from": "external", "to": "smtpIn", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "smtpIn", "to": "inQ", "sourceHandle": "left", "targetHandle": "right" },
      { "from": "inQ", "to": "proc", "sourceHandle": "left", "targetHandle": "right" },
      { "from": "proc", "to": "store", "sourceHandle": "top", "targetHandle": "bottom", "label": "store" },
      { "from": "web", "to": "store", "sourceHandle": "right", "targetHandle": "left", "label": "read" }
    ]
  },
  {
    "id": "object-storage",
    "name": "Object Storage",
    "group": "media-storage",
    "description": "The API service checks identity and access, records object metadata, and hands the bytes to a data service that writes to a primary node and replicates to two more.",
    "nodes": [
      { "key": "iam", "label": "Identity and Access", "shape": "rectangle", "color": "Purple", "x": 520, "y": 0 },
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 208 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 184, "width": 176, "height": 112 },
      { "key": "api", "label": "API Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 200 },
      { "key": "meta", "label": "Metadata Service", "shape": "rectangle", "color": "Green", "x": 780, "y": 100 },
      { "key": "metaDb", "label": "Metadata DB", "shape": "cylinder", "color": "Neutral", "x": 1056, "y": 84, "width": 128, "height": 112 },
      { "key": "data", "label": "Data Service", "shape": "rectangle", "color": "Green", "x": 780, "y": 340 },
      { "key": "node1", "label": "Data Node 1", "shape": "cylinder", "color": "Neutral", "x": 1064, "y": 324 },
      { "key": "node2", "label": "Data Node 2", "shape": "cylinder", "color": "Neutral", "x": 1324, "y": 244 },
      { "key": "node3", "label": "Data Node 3", "shape": "cylinder", "color": "Neutral", "x": 1324, "y": 404 },
      { "key": "placement", "label": "Placement Service", "shape": "rectangle", "color": "Green", "x": 780, "y": 540 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "api", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "iam", "sourceHandle": "top", "targetHandle": "bottom", "label": "authorize" },
      { "from": "api", "to": "meta", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "data", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "meta", "to": "metaDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "data", "to": "node1", "sourceHandle": "right", "targetHandle": "left", "label": "write" },
      { "from": "node1", "to": "node2", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "node1", "to": "node3", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "data", "to": "placement", "sourceHandle": "bottom", "targetHandle": "top", "label": "which node" }
    ]
  },
  {
    "id": "web-crawler",
    "name": "Web Crawler",
    "group": "search-location",
    "description": "The URL frontier feeds fetchers. Pages are parsed and checked for duplicates, new content is stored, and extracted links go through a filter back to the frontier.",
    "nodes": [
      { "key": "seeds", "label": "Seed URLs", "shape": "rectangle", "color": "Neutral", "x": 0, "y": 16 },
      { "key": "frontier", "label": "URL Frontier", "shape": "hexagon", "color": "Orange", "x": 268, "y": 8 },
      { "key": "fetcher", "label": "HTML Fetcher", "shape": "rectangle", "color": "Teal", "x": 520, "y": 16 },
      { "key": "parser", "label": "Content Parser", "shape": "rectangle", "color": "Teal", "x": 780, "y": 16 },
      { "key": "dedup", "label": "Duplicate Check", "shape": "diamond", "color": "Purple", "x": 1024, "y": 0, "width": 192, "height": 112 },
      { "key": "extractor", "label": "Link Extractor", "shape": "rectangle", "color": "Teal", "x": 1300, "y": 16 },
      { "key": "dns", "label": "DNS Resolver", "shape": "circle", "color": "Purple", "x": 544, "y": 200, "width": 112, "height": 112 },
      { "key": "content", "label": "Content Store", "shape": "cylinder", "color": "Neutral", "x": 1064, "y": 200 },
      { "key": "filter", "label": "URL Filter", "shape": "rectangle", "color": "Green", "x": 1300, "y": 256 }
    ],
    "edges": [
      { "from": "seeds", "to": "frontier", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "frontier", "to": "fetcher", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "fetcher", "to": "dns", "sourceHandle": "bottom", "targetHandle": "top", "label": "resolve" },
      { "from": "fetcher", "to": "parser", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "parser", "to": "dedup", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "dedup", "to": "content", "sourceHandle": "bottom", "targetHandle": "top", "label": "new page" },
      { "from": "dedup", "to": "extractor", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "extractor", "to": "filter", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "filter", "to": "frontier", "sourceHandle": "bottom", "targetHandle": "bottom", "label": "new URLs" }
    ]
  },
  {
    "id": "search-autocomplete",
    "name": "Search Autocomplete",
    "group": "search-location",
    "description": "API servers answer each prefix from a trie cache. Offline, query logs are aggregated and workers rebuild the trie, which is then loaded into the cache.",
    "nodes": [
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 24 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 0, "width": 176, "height": 112 },
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 520, "y": 16 },
      { "key": "trieCache", "label": "Trie Cache", "shape": "cylinder", "color": "Pink", "x": 804, "y": 0 },
      { "key": "trieDb", "label": "Trie DB", "shape": "cylinder", "color": "Neutral", "x": 1064, "y": 0 },
      { "key": "logs", "label": "Query Logs", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 210 },
      { "key": "aggregators", "label": "Aggregators", "shape": "rectangle", "color": "Green", "x": 780, "y": 226 },
      { "key": "workers", "label": "Trie Workers", "shape": "rectangle", "color": "Green", "x": 1040, "y": 226 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "api", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "trieCache", "sourceHandle": "right", "targetHandle": "left", "label": "prefix" },
      { "from": "trieDb", "to": "trieCache", "sourceHandle": "left", "targetHandle": "right", "label": "snapshot" },
      { "from": "api", "to": "logs", "sourceHandle": "bottom", "targetHandle": "top", "label": "log query" },
      { "from": "logs", "to": "aggregators", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "aggregators", "to": "workers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "workers", "to": "trieDb", "sourceHandle": "top", "targetHandle": "bottom", "label": "build trie" }
    ]
  },
  {
    "id": "proximity-service",
    "name": "Proximity Service",
    "group": "search-location",
    "description": "A location service answers nearby searches from a geo index cache backed by read replicas. A business service writes place changes to the primary database.",
    "nodes": [
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 164 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 140, "width": 176, "height": 112 },
      { "key": "location", "label": "Location Service", "shape": "rectangle", "color": "Teal", "x": 560, "y": 16 },
      { "key": "business", "label": "Business Service", "shape": "rectangle", "color": "Teal", "x": 560, "y": 296 },
      { "key": "geoCache", "label": "Geo Index Cache", "shape": "cylinder", "color": "Pink", "x": 864, "y": 0 },
      { "key": "replica", "label": "Read Replicas", "shape": "cylinder", "color": "Neutral", "x": 1144, "y": 0 },
      { "key": "primary", "label": "Primary DB", "shape": "cylinder", "color": "Neutral", "x": 864, "y": 280 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "location", "sourceHandle": "right", "targetHandle": "left", "label": "search" },
      { "from": "lb", "to": "business", "sourceHandle": "right", "targetHandle": "left", "label": "updates" },
      { "from": "location", "to": "geoCache", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "geoCache", "to": "replica", "sourceHandle": "right", "targetHandle": "left", "label": "on miss" },
      { "from": "business", "to": "primary", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "primary", "to": "replica", "sourceHandle": "right", "targetHandle": "bottom", "label": "replicate" }
    ]
  },
  {
    "id": "maps-navigation",
    "name": "Maps and Navigation",
    "group": "search-location",
    "description": "Map tiles come from a CDN. A navigation service plans routes with a shortest path service and an ETA service, while location updates from phones feed the location store.",
    "nodes": [
      { "key": "cdn", "label": "CDN", "shape": "circle", "color": "Purple", "x": 292, "y": 8 },
      { "key": "tiles", "label": "Map Tiles", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 0 },
      { "key": "client", "label": "Mobile Client", "shape": "pill", "color": "Blue", "x": 0, "y": 224 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 200, "width": 176, "height": 112 },
      { "key": "nav", "label": "Navigation Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 216 },
      { "key": "planner", "label": "Route Planner", "shape": "rectangle", "color": "Teal", "x": 780, "y": 216 },
      { "key": "shortest", "label": "Shortest Path Service", "shape": "rectangle", "color": "Green", "x": 1040, "y": 216 },
      { "key": "routing", "label": "Routing Tiles", "shape": "cylinder", "color": "Neutral", "x": 1324, "y": 200 },
      { "key": "location", "label": "Location Service", "shape": "rectangle", "color": "Teal", "x": 260, "y": 426 },
      { "key": "locDb", "label": "Location DB", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 410 },
      { "key": "eta", "label": "ETA Service", "shape": "rectangle", "color": "Green", "x": 780, "y": 426 },
      { "key": "traffic", "label": "Traffic DB", "shape": "cylinder", "color": "Neutral", "x": 1064, "y": 410 }
    ],
    "edges": [
      { "from": "client", "to": "cdn", "sourceHandle": "top", "targetHandle": "left", "label": "map tiles" },
      { "from": "cdn", "to": "tiles", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "nav", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "nav", "to": "planner", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "planner", "to": "shortest", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "shortest", "to": "routing", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "location", "sourceHandle": "bottom", "targetHandle": "top", "label": "GPS updates" },
      { "from": "location", "to": "locDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "planner", "to": "eta", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "eta", "to": "traffic", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "payment-system",
    "name": "Payment System",
    "group": "payments",
    "description": "A payment service records each payment, sends it to an external provider through an executor, and updates the wallet and the ledger. A reconciliation job checks the ledger against the provider's settlement file.",
    "nodes": [
      { "key": "paymentDb", "label": "Payment DB", "shape": "cylinder", "color": "Neutral", "x": 284, "y": 0 },
      { "key": "order", "label": "Order Service", "shape": "rectangle", "color": "Blue", "x": 0, "y": 216 },
      { "key": "payment", "label": "Payment Service", "shape": "rectangle", "color": "Teal", "x": 260, "y": 216 },
      { "key": "executor", "label": "Payment Executor", "shape": "rectangle", "color": "Teal", "x": 560, "y": 216 },
      { "key": "psp", "label": "Payment Provider", "shape": "rectangle", "color": "Pink", "x": 820, "y": 216 },
      { "key": "card", "label": "Card Networks", "shape": "rectangle", "color": "Pink", "x": 1080, "y": 216 },
      { "key": "wallet", "label": "Wallet Service", "shape": "rectangle", "color": "Green", "x": 130, "y": 416 },
      { "key": "ledger", "label": "Ledger Service", "shape": "rectangle", "color": "Green", "x": 390, "y": 416 },
      { "key": "recon", "label": "Reconciliation Job", "shape": "rectangle", "color": "Green", "x": 820, "y": 416 },
      { "key": "walletDb", "label": "Wallet DB", "shape": "cylinder", "color": "Neutral", "x": 154, "y": 600 },
      { "key": "ledgerDb", "label": "Ledger DB", "shape": "cylinder", "color": "Neutral", "x": 414, "y": 600 }
    ],
    "edges": [
      { "from": "order", "to": "payment", "sourceHandle": "right", "targetHandle": "left", "label": "pay" },
      { "from": "payment", "to": "executor", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "executor", "to": "psp", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "psp", "to": "card", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "payment", "to": "paymentDb", "sourceHandle": "top", "targetHandle": "bottom" },
      { "from": "payment", "to": "wallet", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "payment", "to": "ledger", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "wallet", "to": "walletDb", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "ledger", "to": "ledgerDb", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "psp", "to": "recon", "sourceHandle": "bottom", "targetHandle": "top", "label": "settlement" },
      { "from": "recon", "to": "ledger", "sourceHandle": "left", "targetHandle": "right", "label": "verify" }
    ]
  },
  {
    "id": "digital-wallet",
    "name": "Digital Wallet",
    "group": "payments",
    "description": "Transfers become commands in a queue. A state machine validates them and appends events to an event store, and a read model built from those events answers balance queries.",
    "nodes": [
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 24 },
      { "key": "transfer", "label": "Transfer Service", "shape": "rectangle", "color": "Teal", "x": 260, "y": 16 },
      { "key": "commands", "label": "Command Queue", "shape": "hexagon", "color": "Orange", "x": 528, "y": 8 },
      { "key": "machine", "label": "Wallet State Machine", "shape": "rectangle", "color": "Green", "x": 780, "y": 16 },
      { "key": "events", "label": "Event Store", "shape": "cylinder", "color": "Neutral", "x": 1064, "y": 0 },
      { "key": "balance", "label": "Balance Service", "shape": "rectangle", "color": "Teal", "x": 260, "y": 226 },
      { "key": "balanceDb", "label": "Balance DB", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 210 },
      { "key": "builder", "label": "Read Model Builder", "shape": "rectangle", "color": "Green", "x": 780, "y": 226 }
    ],
    "edges": [
      { "from": "client", "to": "transfer", "sourceHandle": "right", "targetHandle": "left", "label": "transfer" },
      { "from": "transfer", "to": "commands", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "commands", "to": "machine", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "machine", "to": "events", "sourceHandle": "right", "targetHandle": "left", "label": "append" },
      { "from": "events", "to": "builder", "sourceHandle": "bottom", "targetHandle": "right" },
      { "from": "builder", "to": "balanceDb", "sourceHandle": "left", "targetHandle": "right", "label": "update" },
      { "from": "balance", "to": "balanceDb", "sourceHandle": "right", "targetHandle": "left", "label": "read" },
      { "from": "client", "to": "balance", "sourceHandle": "bottom", "targetHandle": "left", "label": "balance" }
    ]
  },
  {
    "id": "hotel-reservation",
    "name": "Hotel Reservation",
    "group": "payments",
    "description": "An API gateway routes guests to hotel, rate, reservation and payment services. Each service owns its database, and the reservation service charges through the payment service.",
    "nodes": [
      { "key": "client", "label": "Guests", "shape": "pill", "color": "Blue", "x": 0, "y": 264 },
      { "key": "gateway", "label": "API Gateway", "shape": "rectangle", "color": "Purple", "x": 260, "y": 256 },
      { "key": "hotel", "label": "Hotel Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 16 },
      { "key": "rate", "label": "Rate Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 176 },
      { "key": "reservation", "label": "Reservation Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 336 },
      { "key": "payment", "label": "Payment Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 496 },
      { "key": "hotelDb", "label": "Hotel DB", "shape": "cylinder", "color": "Neutral", "x": 804, "y": 0 },
      { "key": "rateDb", "label": "Rate DB", "shape": "cylinder", "color": "Neutral", "x": 804, "y": 160 },
      { "key": "reservationDb", "label": "Reservation DB", "shape": "cylinder", "color": "Neutral", "x": 796, "y": 320, "width": 128, "height": 112 },
      { "key": "paymentDb", "label": "Payment DB", "shape": "cylinder", "color": "Neutral", "x": 804, "y": 480 }
    ],
    "edges": [
      { "from": "client", "to": "gateway", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gateway", "to": "hotel", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gateway", "to": "rate", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gateway", "to": "reservation", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gateway", "to": "payment", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "hotel", "to": "hotelDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "rate", "to": "rateDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "reservation", "to": "reservationDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "payment", "to": "paymentDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "reservation", "to": "payment", "sourceHandle": "bottom", "targetHandle": "top", "label": "charge" }
    ]
  },
  {
    "id": "stock-exchange",
    "name": "Stock Exchange",
    "group": "payments",
    "description": "Orders pass a risk check, get a sequence number, and reach the matching engine. Executions go to a market data publisher and to a reporter for the record.",
    "nodes": [
      { "key": "risk", "label": "Risk Manager", "shape": "rectangle", "color": "Green", "x": 520, "y": 0 },
      { "key": "wallet", "label": "Wallet Service", "shape": "rectangle", "color": "Green", "x": 780, "y": 0 },
      { "key": "client", "label": "Broker Clients", "shape": "pill", "color": "Blue", "x": 0, "y": 208 },
      { "key": "gateway", "label": "Client Gateway", "shape": "rectangle", "color": "Purple", "x": 260, "y": 200 },
      { "key": "orders", "label": "Order Manager", "shape": "rectangle", "color": "Teal", "x": 520, "y": 200 },
      { "key": "sequencer", "label": "Sequencer", "shape": "rectangle", "color": "Teal", "x": 780, "y": 200 },
      { "key": "engine", "label": "Matching Engine", "shape": "rectangle", "color": "Teal", "x": 1040, "y": 200 },
      { "key": "publisher", "label": "Market Data Publisher", "shape": "rectangle", "color": "Green", "x": 1300, "y": 200 },
      { "key": "reporter", "label": "Reporter", "shape": "rectangle", "color": "Green", "x": 1040, "y": 410 },
      { "key": "reportDb", "label": "Reporting DB", "shape": "cylinder", "color": "Neutral", "x": 1324, "y": 394 }
    ],
    "edges": [
      { "from": "client", "to": "gateway", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "gateway", "to": "orders", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "orders", "to": "sequencer", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "sequencer", "to": "engine", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "engine", "to": "publisher", "sourceHandle": "right", "targetHandle": "left", "label": "trades" },
      { "from": "orders", "to": "risk", "sourceHandle": "top", "targetHandle": "bottom", "label": "check" },
      { "from": "risk", "to": "wallet", "sourceHandle": "right", "targetHandle": "left", "label": "funds" },
      { "from": "engine", "to": "reporter", "sourceHandle": "bottom", "targetHandle": "top", "label": "executions" },
      { "from": "reporter", "to": "reportDb", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "distributed-message-queue",
    "name": "Distributed Message Queue",
    "group": "data",
    "description": "Producers publish to brokers that replicate each partition. Consumer groups pull from the brokers, and a coordination service tracks brokers and elects leaders.",
    "nodes": [
      { "key": "producers", "label": "Producers", "shape": "rectangle", "color": "Blue", "x": 0, "y": 176 },
      { "key": "broker1", "label": "Broker 1", "shape": "hexagon", "color": "Orange", "x": 268, "y": 0 },
      { "key": "broker2", "label": "Broker 2", "shape": "hexagon", "color": "Orange", "x": 268, "y": 168 },
      { "key": "broker3", "label": "Broker 3", "shape": "hexagon", "color": "Orange", "x": 268, "y": 336 },
      { "key": "groupA", "label": "Consumer Group A", "shape": "rectangle", "color": "Green", "x": 520, "y": 92 },
      { "key": "groupB", "label": "Consumer Group B", "shape": "rectangle", "color": "Green", "x": 520, "y": 260 },
      { "key": "coord", "label": "Coordination Service", "shape": "rectangle", "color": "Teal", "x": 260, "y": 544 },
      { "key": "meta", "label": "Metadata Store", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 528 }
    ],
    "edges": [
      { "from": "producers", "to": "broker1", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "producers", "to": "broker2", "sourceHandle": "right", "targetHandle": "left", "label": "publish" },
      { "from": "producers", "to": "broker3", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "broker1", "to": "broker2", "sourceHandle": "bottom", "targetHandle": "top", "label": "replicate" },
      { "from": "broker2", "to": "broker3", "sourceHandle": "bottom", "targetHandle": "top", "label": "replicate" },
      { "from": "broker1", "to": "groupA", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "broker2", "to": "groupA", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "broker2", "to": "groupB", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "broker3", "to": "groupB", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "broker3", "to": "coord", "sourceHandle": "bottom", "targetHandle": "top", "label": "heartbeat" },
      { "from": "coord", "to": "meta", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "metrics-monitoring",
    "name": "Metrics Monitoring",
    "group": "data",
    "description": "Collectors pull metrics and push them through a queue into a time-series database. A query service feeds dashboards and an alert manager that notifies people.",
    "nodes": [
      { "key": "sources", "label": "Metric Sources", "shape": "rectangle", "color": "Blue", "x": 0, "y": 16 },
      { "key": "collectors", "label": "Metrics Collectors", "shape": "rectangle", "color": "Teal", "x": 260, "y": 16 },
      { "key": "queue", "label": "Message Queue", "shape": "hexagon", "color": "Orange", "x": 528, "y": 8 },
      { "key": "consumers", "label": "Stream Consumers", "shape": "rectangle", "color": "Green", "x": 780, "y": 16 },
      { "key": "tsdb", "label": "Time-Series DB", "shape": "cylinder", "color": "Neutral", "x": 1056, "y": 0, "width": 128, "height": 112 },
      { "key": "dashboards", "label": "Dashboards", "shape": "rectangle", "color": "Blue", "x": 780, "y": 226 },
      { "key": "query", "label": "Query Service", "shape": "rectangle", "color": "Teal", "x": 1040, "y": 226 },
      { "key": "alerts", "label": "Alert Manager", "shape": "rectangle", "color": "Red", "x": 1300, "y": 226 },
      { "key": "channels", "label": "Email and Pager", "shape": "rectangle", "color": "Pink", "x": 1300, "y": 426 }
    ],
    "edges": [
      { "from": "collectors", "to": "sources", "sourceHandle": "left", "targetHandle": "right", "label": "pull" },
      { "from": "collectors", "to": "queue", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "queue", "to": "consumers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "consumers", "to": "tsdb", "sourceHandle": "right", "targetHandle": "left", "label": "write" },
      { "from": "query", "to": "tsdb", "sourceHandle": "top", "targetHandle": "bottom", "label": "query" },
      { "from": "dashboards", "to": "query", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "alerts", "to": "query", "sourceHandle": "left", "targetHandle": "right" },
      { "from": "alerts", "to": "channels", "sourceHandle": "bottom", "targetHandle": "top", "label": "notify" }
    ]
  },
  {
    "id": "ad-click-aggregation",
    "name": "Ad Click Aggregation",
    "group": "data",
    "description": "Click events enter a queue and are stored raw. An aggregation service counts them per minute into a second queue, and a writer saves the totals for the query service.",
    "nodes": [
      { "key": "logs", "label": "Click Log Watcher", "shape": "rectangle", "color": "Blue", "x": 0, "y": 16 },
      { "key": "rawQ", "label": "Raw Events Queue", "shape": "hexagon", "color": "Orange", "x": 268, "y": 8 },
      { "key": "aggregation", "label": "Aggregation Service", "shape": "rectangle", "color": "Teal", "x": 520, "y": 16 },
      { "key": "aggQ", "label": "Aggregates Queue", "shape": "hexagon", "color": "Orange", "x": 818, "y": 8 },
      { "key": "writer", "label": "Database Writer", "shape": "rectangle", "color": "Green", "x": 1080, "y": 16 },
      { "key": "aggDb", "label": "Aggregates DB", "shape": "cylinder", "color": "Neutral", "x": 1366, "y": 0, "width": 128, "height": 112 },
      { "key": "rawWriter", "label": "Raw Data Writer", "shape": "rectangle", "color": "Green", "x": 260, "y": 226 },
      { "key": "rawDb", "label": "Raw Data DB", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 210 },
      { "key": "dashboard", "label": "Dashboards", "shape": "rectangle", "color": "Blue", "x": 1080, "y": 226 },
      { "key": "query", "label": "Query Service", "shape": "rectangle", "color": "Teal", "x": 1350, "y": 226 }
    ],
    "edges": [
      { "from": "logs", "to": "rawQ", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "rawQ", "to": "aggregation", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "aggregation", "to": "aggQ", "sourceHandle": "right", "targetHandle": "left", "label": "per minute" },
      { "from": "aggQ", "to": "writer", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "writer", "to": "aggDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "rawQ", "to": "rawWriter", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "rawWriter", "to": "rawDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "query", "to": "aggDb", "sourceHandle": "top", "targetHandle": "bottom", "label": "query" },
      { "from": "dashboard", "to": "query", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "realtime-leaderboard",
    "name": "Real-time Leaderboard",
    "group": "data",
    "description": "The game service reports each win to a leaderboard service, which keeps scores in a sorted set cache. Rank queries read that cache and add player details from a profile store.",
    "nodes": [
      { "key": "client", "label": "Game Clients", "shape": "pill", "color": "Blue", "x": 0, "y": 108 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 252, "y": 84, "width": 176, "height": 112 },
      { "key": "game", "label": "Game Service", "shape": "rectangle", "color": "Teal", "x": 560, "y": 0 },
      { "key": "board", "label": "Leaderboard Service", "shape": "rectangle", "color": "Teal", "x": 560, "y": 200 },
      { "key": "scores", "label": "Sorted Set Cache", "shape": "cylinder", "color": "Pink", "x": 856, "y": 184, "width": 128, "height": 112 },
      { "key": "profiles", "label": "Player Profiles", "shape": "cylinder", "color": "Neutral", "x": 584, "y": 394 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "game", "sourceHandle": "right", "targetHandle": "left", "label": "win" },
      { "from": "lb", "to": "board", "sourceHandle": "right", "targetHandle": "left", "label": "top ranks" },
      { "from": "game", "to": "board", "sourceHandle": "bottom", "targetHandle": "top", "label": "add score" },
      { "from": "board", "to": "scores", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "board", "to": "profiles", "sourceHandle": "bottom", "targetHandle": "top", "label": "names" }
    ]
  }
```

How this data was checked by the spec author (2026-11-14), so nobody needs to re-derive it: a script ran every template through the production `applyOps`, computed every edge's route with React Flow's own `getSmoothStepPath`, and confirmed that no two nodes are closer than 40 units, no edge route passes through a node, no edge label box touches a node or another label, and every node label fits its shape's label area at the estimated text width. All sixteen layouts were also rendered and looked at. Font metrics in the real app can still differ from the estimate, which is why the manual checklist asks for a look at each one.

Do not change the functions, the import line, `TEMPLATE_GAP`, `sizeOf` or `boxOf`.

## 3. `components/canvas/TemplatesDialog.jsx`

The dialog shows one group at a time. `TemplatePreview`, the card markup, the title, the line under it and the Close button with `data-autofocus` are unchanged.

- Signature: `TemplatesDialog({ open, onClose, onAdd, initialGroup = TEMPLATE_GROUPS[0].id })`. `ShapePanel` does not pass `initialGroup`; the prop exists so tests can render each group.
- State: `const [groupId, setGroupId] = useState(initialGroup)`, with `useState` added to the React import. The shown group is `TEMPLATE_GROUPS.find((group) => group.id === groupId) ?? TEMPLATE_GROUPS[0]`, so an unknown id falls back to the first group. The component stays mounted while the dialog is closed, so reopening shows the group last chosen; that is intended.
- **Group buttons.** Between the line under the title and the list, add:

  ```jsx
  <div role="group" aria-label="Template groups" className="mt-4 flex flex-wrap gap-2">
    {TEMPLATE_GROUPS.map((group) => (
      <button key={group.id} type="button" aria-pressed={group.id === shown.id} onClick={() => setGroupId(group.id)}
        className={`rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--collab-accent)] ${group.id === shown.id
          ? "border-[var(--collab-border-strong)] bg-[var(--collab-panel-2)] text-[var(--collab-text)]"
          : "border-[var(--collab-border)] text-[var(--collab-muted)] hover:text-[var(--collab-text)]"}`}>
        {group.title}
      </button>
    ))}
  </div>
  ```

  (`shown` is the group from the bullet above; name it as you like.)
- **The list** renders only the shown group: the scroll container keeps its classes, with `mt-4` in place of `mt-6`, and gets `key={shown.id}` so switching groups remounts it and starts at the top. Inside it there is one `<section aria-labelledby=...>` with the Eyebrow `h3` for the shown group's title and that group's cards in `CANVAS_TEMPLATES` order, exactly as S32 renders a section. Template names stay `h4`.
- Close keeps `data-autofocus`, so the dialog still opens with focus on Close, after the group buttons in tab order.

No raw hex, no Tailwind palette colors, no new listener, no `useEffect`.

## 4. Tests: `test/canvasTemplates.test.mjs`

Keep the harness as it is. Update the existing tests where the numbers or groups changed, and add the new ones. Every test that loops over `CANVAS_TEMPLATES` now covers all twenty-seven.

**Data**

1. The ids are exactly, in order, the `id` column of the table below. Each template has a non-empty name and description. The array and its contents are deeply frozen.
2. `TEMPLATE_GROUPS` deep-equals the seven entries in section 1, in order, and is deeply frozen. Every template's `group` is the table's value, and every group has at least one template.
3. **Fingerprints.** Keep S32's `fingerprint` function exactly as it is in the test file (it is the one in `specs/32-more-starter-templates.md`, section 4) and assert each template against this table, together with the node, edge and labelled-edge counts. The three `patterns` fingerprints are unchanged from S32. The eight S32 templates have new fingerprints only because `group` is part of the fingerprint.

   | id | group | nodes | edges | labelled edges | fingerprint |
   | --- | --- | --- | --- | --- | --- |
   | `microservices` | `patterns` | 7 | 6 | 0 | `824ce8b514cc8a64` |
   | `cicd-pipeline` | `patterns` | 7 | 6 | 0 | `da41e2c6faaf8250` |
   | `event-driven` | `patterns` | 7 | 7 | 0 | `a616d5a4f436b6f9` |
   | `scale-to-millions` | `foundations` | 10 | 10 | 5 | `587c9da04033957c` |
   | `rate-limiter` | `foundations` | 8 | 7 | 5 | `24d3dd7cf5e3b207` |
   | `url-shortener` | `foundations` | 6 | 6 | 4 | `314d3716af0412ef` |
   | `news-feed` | `social` | 11 | 11 | 3 | `aa1e6448bf7b8855` |
   | `chat-system` | `social` | 10 | 9 | 5 | `1c6284163875b0df` |
   | `video-streaming` | `media-storage` | 9 | 10 | 5 | `2a8535e9ab2d006a` |
   | `cloud-file-storage` | `media-storage` | 10 | 10 | 4 | `202229a8d3fe1a36` |
   | `notification-system` | `social` | 12 | 14 | 0 | `d7dcdb324b3b37e4` |
   | `unique-id-generator` | `foundations` | 6 | 7 | 1 | `36be86d38ab5f7f0` |
   | `nearby-friends` | `social` | 8 | 7 | 3 | `344b9d6836413914` |
   | `email-service` | `social` | 10 | 10 | 3 | `b93f2594296c6100` |
   | `object-storage` | `media-storage` | 11 | 10 | 3 | `85f66048f2085539` |
   | `web-crawler` | `search-location` | 9 | 9 | 3 | `97657654a5a25c92` |
   | `search-autocomplete` | `search-location` | 8 | 8 | 4 | `2cecff9eed03829e` |
   | `proximity-service` | `search-location` | 7 | 7 | 4 | `098c3326cb6c5378` |
   | `maps-navigation` | `search-location` | 12 | 11 | 2 | `a9961d55fa54d0a6` |
   | `payment-system` | `payments` | 11 | 11 | 3 | `3ae1c0cbcf046cb6` |
   | `digital-wallet` | `payments` | 8 | 8 | 5 | `b613d331b632fdb1` |
   | `hotel-reservation` | `payments` | 10 | 10 | 1 | `70b2719e7c155282` |
   | `stock-exchange` | `payments` | 10 | 9 | 4 | `9b5f7161c5a753ab` |
   | `distributed-message-queue` | `data` | 8 | 11 | 4 | `ca93f1ccb9772b62` |
   | `metrics-monitoring` | `data` | 9 | 8 | 4 | `f19e34983107bbb0` |
   | `ad-click-aggregation` | `data` | 10 | 9 | 2 | `6f617634a32c2b1f` |
   | `realtime-leaderboard` | `data` | 6 | 6 | 4 | `22b4107a5256a0ba` |

   **If a fingerprint does not match, the data in `canvasTemplates.js` is wrong. Fix the data. Never change an expected fingerprint.** If you believe the table itself is wrong, stop and record an open question.
4. The existing structure checks run for all twenty-seven (unique keys, shapes, colors, label length, edge keys, handles, no overlap, edge label rules, no repeated `from` and `to` pair, ops within `MAX_OPS_PER_COMMIT`).
5. The origin and 40-unit spacing checks that S32 applied to the `system-design` group now apply to every template whose group is not `patterns`.

**Builder**

6. The existing builder tests are unchanged in logic and run for all twenty-seven: the real `applyOps` accepts the ops on an empty canvas; edge labels survive; empty-canvas centering; placement below existing content; fresh ids and double insertion; the `invertOps` round trip; malformed inputs; the bad and over-long edge label cases; the node-limit test.

**Markup**

7. Default render (`open`, no `initialGroup`): the title; a `role="group"` element labelled `Template groups` holding seven buttons with the seven titles in order; exactly one of them has `aria-pressed="true"`, the first; one `h3` reading `Architecture patterns`; exactly three `h4` names, three `Add <name> template` buttons and three preview SVGs; the Close button with `data-autofocus`. No name from another group appears.
8. For each of the seven groups, rendered with `initialGroup` set to its id: the pressed button is that group's; the `h3` is its title; the `h4` names are exactly that group's templates in `CANVAS_TEMPLATES` order; there is one `aria-hidden` preview SVG per card, with one node element per template node and one `line` per edge. Across the seven renders the names add up to all twenty-seven, each once.
9. `initialGroup="nope"` renders the first group. `open={false}` renders nothing.
10. The `ShapePanel` test is unchanged.

Static markup does not run the group button clicks, the insert handler or `fitBounds`. Say so in the slice note.

## 5. Things that stay true

- Every canvas change goes through `dispatch`. One template is one dispatch.
- After insertion the nodes and edges are ordinary ones. Nothing template-specific is stored.
- `canvasTemplates.js` imports only from `@shared/canvasOps.js`. Nothing outside `src/collaborate/` imports it.
- No import from `src/chat/` or `src/blog/`. No server change, no new socket event, payload or limit.
- The eleven existing templates are unchanged apart from the `group` of the eight named in section 1.

## 6. Documentation

- `context/1-project-overview.md`: change the starter templates line under Collaborative Canvas to say twenty-seven templates in seven groups, naming the groups.
- `context/2-architecture.md`: one sentence that the dialog filters by `TEMPLATE_GROUPS` and renders one group at a time; checkpoint line.
- `context/3-ui-context.md`: a short `### S33` section: the group buttons (pill buttons with `aria-pressed`, wrapping), one group visible at a time, the list restarting at the top on a group change, and the last group being remembered while the workspace stays open.
- `context/specs/00-build-plan.md`: add S33 to Phase L as implemented.
- `readme.md`: reword the existing **Starter Templates** bullet in place, keeping its format: the turn holder can drop one of twenty-seven ready-made diagrams onto the canvas, grouped by theme, from architecture patterns to system design classics such as a URL shortener, a chat system, a payment system and a web crawler.
- Tracker and HANDOFF: status, slice note, what was not run.

## Verify when done

- [ ] `node --test test/canvasTemplates.test.mjs` passes. Report the count (baseline 12).
- [ ] Each of the twelve other root suites passes in its own command, unchanged. Report each count (baseline 293).
- [ ] `cd server && npm test` still passes 328.
- [ ] `npm run build` passes with no new warnings. Report the entry, `Collaborate` and `WorkspacePage` chunk sizes. The entry chunk must not grow; `WorkspacePage` grows by the template data and the few lines of dialog code.
- [ ] `git diff --check` passes, and `git diff --stat` shows only this spec's allowed files on top of anything earlier slices left uncommitted.
- [ ] `canvasTemplates.js` still has one import line, from `@shared/canvasOps.js`, and its functions are unchanged.
- [ ] No raw hex in `TemplatesDialog.jsx`.
- [ ] A search of `src/` and `readme.md` finds none of: `Alex Xu`, `System Design Interview`, `YouTube`, `Google Drive`, `Google Maps`.
- [ ] A search of `src/` and `test/` finds no `system-design`, the retired group id. (Corrected 2026-11-14: this check first covered `readme.md` too, where the phrase "system-design workspace" is ordinary prose from before S33 and stays.)

**Manual checklist.** Record each line as passed or **not run**. Do not create live projects to satisfy it.

- [ ] The dialog opens on Architecture patterns with seven group buttons; each button shows its group and is marked as pressed; the list starts at the top after each switch.
- [ ] The group buttons work with the keyboard (Tab, Enter, Space), and focus stays inside the dialog.
- [ ] Closing and reopening the dialog shows the group last chosen.
- [ ] Each of the sixteen new templates, added to an empty canvas: lands centered, the view fits it, every node label fits inside its shape, no edge label covers a node, and the arrows read in the intended direction.
- [ ] In Web Crawler, the edge from URL Filter back to URL Frontier runs below DNS Resolver and Content Store without touching them.
- [ ] One Undo removes a whole new template; Redo brings it back; a watcher's canvas matches after each step.
- [ ] The eleven earlier templates still insert as before.
- [ ] At 320px wide the group buttons wrap, the dialog still scrolls and the cards are readable.

## Review checklist (for the reviewer)

Rerun every command above yourself. Then check:

1. The fingerprint function in the test is unchanged from S32, and the expected values are this spec's table. A passing fingerprint test then proves all twenty-seven templates match, so no value-by-value comparison is needed.
2. The eight S32 templates differ from before only by `group`; the three `patterns` templates and the array order of the first eleven are untouched.
3. `templateBounds`, `buildTemplateOps` and the helpers in `canvasTemplates.js` are byte-identical to S32.
4. `TemplatesDialog.jsx` changed only as section 3 says: card markup and `TemplatePreview` are unchanged; `ShapePanel.jsx`, `Dialog.jsx`, `EmptyCanvasHint.jsx`, the store and `test/mobileA11y.test.mjs` are untouched by this slice.
5. No name, description, label or UI string mentions the books, their author, YouTube, Google Drive or Google Maps.
6. No server file changed, and no dependency was added.
7. The slice note claims no browser check that was not run.
