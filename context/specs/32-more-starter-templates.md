# Slice 32 — More starter templates

**Execution status (2026-11-14): Todo.** Spec written; implementation not started.

**Lane** client · **Depends on** S31 (Approved; its `canvasTemplates.js`, `TemplatesDialog.jsx` and `canvasTemplates.test.mjs` must be in the tree) · **Unblocks** nothing

**Spec author** Claude Fable 5.2 · **Implementer / Reviewer** assigned by the user

## Why this slice exists

S31 added three starter templates. On 2026-11-14 the user asked for more, inspired by the topics in Alex Xu's *System Design Interview*. This slice adds eight diagrams on top of S31's mechanism:

| # | Template id | Name shown | Topic it covers |
| --- | --- | --- | --- |
| 1 | `scale-to-millions` | Scaling to Millions of Users | Scale from zero to millions of users (final architecture only) |
| 2 | `rate-limiter` | Rate Limiter | Rate limiter |
| 3 | `url-shortener` | URL Shortener | URL shortener |
| 4 | `news-feed` | News Feed System | News feed system |
| 5 | `chat-system` | Chat System | Chat system |
| 6 | `video-streaming` | Video Streaming | YouTube |
| 7 | `cloud-file-storage` | Cloud File Storage | Google Drive |
| 8 | `notification-system` | Notification System | Notification system |

Each diagram is our own high-level drawing of the topic with standard component names. Nothing is copied from the book: no figure, layout, numbering or wording. Do not add the book's title, the author's name, or the product names YouTube and Google Drive to any template name, description, label or UI text.

It is an addition in Phase L of `00-build-plan.md`. It does not block the launch QA or the drawDB track.

## Baseline and scope

Read AGENTS.md, the six context files in order, HANDOFF.md, `specs/31-starter-templates.md`, and this spec. Recheck `git status` and `git log -3`. S29a, S29b, S30 and S31 may be committed or still uncommitted; either way, change none of their files except the ones this spec names.

Baseline from the S31 review: server suite **328**; twelve root client suites **293** plus `canvasTemplates` **10**; production build passing with entry 578.23 kB, `Collaborate` 24.06 kB, `WorkspacePage` 326.06 kB.

What changes for the holder: the Starter templates dialog lists eleven templates in two groups, and the eight new diagrams arrive with short labels on some of their edges.

Three things change in code, and nothing else:

1. **Data.** Eight templates appended to `CANVAS_TEMPLATES`, a `group` on every template, and a `TEMPLATE_GROUPS` list.
2. **Template format.** A template edge may carry an optional `label`, which the builder writes to the edge's `data.label`.
3. **Dialog.** Cards are shown under two group headings.

The insertion path is untouched: `ShapePanel.addTemplate` still makes one `dispatch(built.ops)` call, so one template is still one commit, one broadcast and one undo frame. The largest new template is 26 ops (limit 50).

No server file changes. No new dependency. No change to `ShapePanel.jsx`, `EmptyCanvasHint.jsx`, `Dialog.jsx`, `WorkspaceCanvas.jsx`, the store, or `test/mobileA11y.test.mjs`.

Mark S32 In progress, implement, run the verification, mark Ready for review with a slice note, and stop. Never commit, push, branch or deploy.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/lib/canvasTemplates.js` | `group` on the three existing templates, eight new templates, `TEMPLATE_GROUPS`, edge `label` support |
| `src/collaborate/components/canvas/TemplatesDialog.jsx` | Group headings |
| `test/canvasTemplates.test.mjs` | Updated and new tests (section 4) |
| `readme.md` | One feature bullet reworded |
| `context/1-project-overview.md`, `context/2-architecture.md`, `context/3-ui-context.md`, `context/6-progress-tracker.md`, `context/HANDOFF.md`, `context/specs/00-build-plan.md` | Documentation |

Everything else stays unchanged. If the work seems to need another file, stop and record an open question in the tracker.

## 1. `lib/canvasTemplates.js`: data

The import line stays as it is. The module stays pure.

### Groups

Add this export above `CANVAS_TEMPLATES`, frozen with the existing `freezeDeep`:

```js
export const TEMPLATE_GROUPS = freezeDeep([
  { id: "patterns", title: "Architecture patterns" },
  { id: "system-design", title: "System design classics" },
]);
```

Add `"group": "patterns"` to each of the three existing templates (`microservices`, `cicd-pipeline`, `event-driven`). **Change nothing else in them**: not a label, coordinate, edge or key order beyond the one new property. Section 4 pins their content with a fingerprint.

### The eight new templates

Append these eight objects to the `CANVAS_TEMPLATES` array, after `event-driven`, in this order. Copy the block as it is. The file's formatting is free (one property per line like the existing entries, or one node per line as here), but every value is fixed: ids, names, descriptions, keys, labels, shapes, colors, coordinates, sizes, edge order, handles and edge labels. Do not round, re-center, rename or reorder anything. The fingerprint test in section 4 fails on any difference.

The format is S31's, with two additions: `group` on the template and an optional `label` on an edge. A node without `width` and `height` uses `DEFAULT_NODE_SIZE[shape]`.

```json
  {
    "id": "scale-to-millions",
    "name": "Scaling to Millions of Users",
    "group": "system-design",
    "description": "DNS and a CDN sit in front of a load balancer and stateless web servers. Data goes to a cache, a primary database with a read replica, and a queue for background workers.",
    "nodes": [
      { "key": "clients", "label": "Web and Mobile Clients", "shape": "pill", "color": "Blue", "x": 291, "y": 16 },
      { "key": "dns", "label": "DNS", "shape": "circle", "color": "Purple", "x": 45, "y": 0 },
      { "key": "cdn", "label": "CDN", "shape": "circle", "color": "Purple", "x": 601, "y": 0 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 283, "y": 190, "width": 176, "height": 112 },
      { "key": "web", "label": "Web Servers", "shape": "rectangle", "color": "Teal", "x": 291, "y": 400 },
      { "key": "cache", "label": "Cache", "shape": "cylinder", "color": "Pink", "x": 0, "y": 590 },
      { "key": "primary", "label": "Primary DB", "shape": "cylinder", "color": "Neutral", "x": 190, "y": 590 },
      { "key": "replica", "label": "Read Replica", "shape": "cylinder", "color": "Neutral", "x": 440, "y": 590 },
      { "key": "queue", "label": "Message Queue", "shape": "hexagon", "color": "Orange", "x": 650, "y": 590 },
      { "key": "workers", "label": "Workers", "shape": "rectangle", "color": "Green", "x": 880, "y": 598 }
    ],
    "edges": [
      { "from": "clients", "to": "dns", "sourceHandle": "left", "targetHandle": "right", "label": "resolve" },
      { "from": "clients", "to": "cdn", "sourceHandle": "right", "targetHandle": "left", "label": "static files" },
      { "from": "clients", "to": "lb", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "lb", "to": "web", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "web", "to": "cache", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "web", "to": "primary", "sourceHandle": "bottom", "targetHandle": "top", "label": "write" },
      { "from": "web", "to": "replica", "sourceHandle": "bottom", "targetHandle": "top", "label": "read" },
      { "from": "web", "to": "queue", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "primary", "to": "replica", "sourceHandle": "right", "targetHandle": "left", "label": "replicate" },
      { "from": "queue", "to": "workers", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "rate-limiter",
    "name": "Rate Limiter",
    "group": "system-design",
    "description": "A middleware checks each request against counters in Redis and rules loaded from a config store. Allowed requests reach the API servers and the rest get a 429 response.",
    "nodes": [
      { "key": "rules", "label": "Rules Config", "shape": "rectangle", "color": "Neutral", "x": 0, "y": 16 },
      { "key": "loader", "label": "Rule Loader", "shape": "rectangle", "color": "Green", "x": 250, "y": 16 },
      { "key": "rulesCache", "label": "Rules Cache", "shape": "cylinder", "color": "Pink", "x": 524, "y": 0 },
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 230, "y": 228 },
      { "key": "limiter", "label": "Rate Limiter Middleware", "shape": "rectangle", "color": "Purple", "x": 500, "y": 220 },
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 790, "y": 220 },
      { "key": "counters", "label": "Redis Counters", "shape": "cylinder", "color": "Pink", "x": 384, "y": 420 },
      { "key": "reject", "label": "429 Too Many Requests", "shape": "rectangle", "color": "Red", "x": 620, "y": 420 }
    ],
    "edges": [
      { "from": "rules", "to": "loader", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "loader", "to": "rulesCache", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "rulesCache", "to": "limiter", "sourceHandle": "bottom", "targetHandle": "top", "label": "rules" },
      { "from": "client", "to": "limiter", "sourceHandle": "right", "targetHandle": "left", "label": "request" },
      { "from": "limiter", "to": "api", "sourceHandle": "right", "targetHandle": "left", "label": "allowed" },
      { "from": "limiter", "to": "counters", "sourceHandle": "bottom", "targetHandle": "top", "label": "count" },
      { "from": "limiter", "to": "reject", "sourceHandle": "bottom", "targetHandle": "top", "label": "over limit" }
    ]
  },
  {
    "id": "url-shortener",
    "name": "URL Shortener",
    "group": "system-design",
    "description": "API servers create a short ID for each long URL and save the mapping. Redirects read the cache first and fall back to the database.",
    "nodes": [
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 208 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 230, "y": 184, "width": 176, "height": 112 },
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 500, "y": 200 },
      { "key": "idgen", "label": "ID Generator", "shape": "rectangle", "color": "Green", "x": 500, "y": 0 },
      { "key": "cache", "label": "Cache", "shape": "cylinder", "color": "Pink", "x": 790, "y": 184 },
      { "key": "db", "label": "URL Database", "shape": "cylinder", "color": "Neutral", "x": 524, "y": 400 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "api", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "idgen", "sourceHandle": "top", "targetHandle": "bottom", "label": "new short ID" },
      { "from": "api", "to": "cache", "sourceHandle": "right", "targetHandle": "left", "label": "lookup" },
      { "from": "api", "to": "db", "sourceHandle": "bottom", "targetHandle": "top", "label": "save" },
      { "from": "cache", "to": "db", "sourceHandle": "bottom", "targetHandle": "right", "label": "on miss" }
    ]
  },
  {
    "id": "news-feed",
    "name": "News Feed System",
    "group": "system-design",
    "description": "Publishing a post saves it and fans it out through a queue to each friend's feed cache. Reading the feed is served from that cache.",
    "nodes": [
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 240, "y": 24 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 470, "y": 0, "width": 176, "height": 112 },
      { "key": "web", "label": "Web Servers", "shape": "rectangle", "color": "Teal", "x": 720, "y": 16 },
      { "key": "post", "label": "Post Service", "shape": "rectangle", "color": "Green", "x": 0, "y": 230 },
      { "key": "fanout", "label": "Fanout Service", "shape": "rectangle", "color": "Green", "x": 240, "y": 230 },
      { "key": "queue", "label": "Message Queue", "shape": "hexagon", "color": "Orange", "x": 480, "y": 222 },
      { "key": "workers", "label": "Fanout Workers", "shape": "rectangle", "color": "Green", "x": 700, "y": 230 },
      { "key": "feed", "label": "News Feed Service", "shape": "rectangle", "color": "Green", "x": 960, "y": 230 },
      { "key": "postDb", "label": "Post DB", "shape": "cylinder", "color": "Neutral", "x": 24, "y": 420 },
      { "key": "graph", "label": "Graph DB", "shape": "cylinder", "color": "Neutral", "x": 264, "y": 420 },
      { "key": "feedCache", "label": "News Feed Cache", "shape": "cylinder", "color": "Pink", "x": 854, "y": 420 }
    ],
    "edges": [
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "web", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "web", "to": "post", "sourceHandle": "bottom", "targetHandle": "top", "label": "publish" },
      { "from": "post", "to": "fanout", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "web", "to": "feed", "sourceHandle": "bottom", "targetHandle": "top", "label": "read feed" },
      { "from": "post", "to": "postDb", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "fanout", "to": "graph", "sourceHandle": "bottom", "targetHandle": "top", "label": "friend IDs" },
      { "from": "fanout", "to": "queue", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "queue", "to": "workers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "workers", "to": "feedCache", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "feed", "to": "feedCache", "sourceHandle": "bottom", "targetHandle": "top" }
    ]
  },
  {
    "id": "chat-system",
    "name": "Chat System",
    "group": "system-design",
    "description": "Clients use HTTP for sign-in and profiles and keep a WebSocket open to the chat servers. Messages pass through a queue to storage and to push notifications for offline users.",
    "nodes": [
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 282, "y": 0, "width": 176, "height": 112 },
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 560, "y": 16 },
      { "key": "userDb", "label": "User DB", "shape": "cylinder", "color": "Neutral", "x": 844, "y": 0 },
      { "key": "userA", "label": "User A", "shape": "pill", "color": "Blue", "x": 0, "y": 150 },
      { "key": "userB", "label": "User B", "shape": "pill", "color": "Blue", "x": 0, "y": 320 },
      { "key": "chat", "label": "Chat Servers", "shape": "rectangle", "color": "Teal", "x": 290, "y": 227 },
      { "key": "queue", "label": "Message Queue", "shape": "hexagon", "color": "Orange", "x": 568, "y": 219 },
      { "key": "store", "label": "Message Store", "shape": "cylinder", "color": "Neutral", "x": 844, "y": 211 },
      { "key": "presence", "label": "Presence Servers", "shape": "rectangle", "color": "Green", "x": 290, "y": 430 },
      { "key": "push", "label": "Push Notifications", "shape": "rectangle", "color": "Pink", "x": 560, "y": 430 }
    ],
    "edges": [
      { "from": "userA", "to": "lb", "sourceHandle": "top", "targetHandle": "left", "label": "HTTP" },
      { "from": "lb", "to": "api", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "userDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "userA", "to": "chat", "sourceHandle": "right", "targetHandle": "left", "label": "WebSocket" },
      { "from": "userB", "to": "chat", "sourceHandle": "right", "targetHandle": "left", "label": "WebSocket" },
      { "from": "chat", "to": "queue", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "queue", "to": "store", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "queue", "to": "push", "sourceHandle": "bottom", "targetHandle": "top", "label": "offline" },
      { "from": "chat", "to": "presence", "sourceHandle": "bottom", "targetHandle": "top", "label": "status" }
    ]
  },
  {
    "id": "video-streaming",
    "name": "Video Streaming",
    "group": "system-design",
    "description": "Uploads go to storage and are transcoded into streaming formats that a CDN delivers. A completion queue updates the video metadata when transcoding ends.",
    "nodes": [
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 260, "y": 16 },
      { "key": "metaDb", "label": "Metadata DB", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 0, "width": 128, "height": 112 },
      { "key": "handler", "label": "Completion Handler", "shape": "rectangle", "color": "Green", "x": 790, "y": 16 },
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 224 },
      { "key": "original", "label": "Original Storage", "shape": "cylinder", "color": "Neutral", "x": 276, "y": 200, "width": 128, "height": 112 },
      { "key": "transcode", "label": "Transcoding Servers", "shape": "rectangle", "color": "Teal", "x": 528, "y": 216 },
      { "key": "queue", "label": "Completion Queue", "shape": "hexagon", "color": "Orange", "x": 798, "y": 208 },
      { "key": "cdn", "label": "CDN", "shape": "circle", "color": "Purple", "x": 292, "y": 416 },
      { "key": "transcoded", "label": "Transcoded Storage", "shape": "cylinder", "color": "Neutral", "x": 544, "y": 408, "width": 128, "height": 112 }
    ],
    "edges": [
      { "from": "client", "to": "api", "sourceHandle": "top", "targetHandle": "left", "label": "metadata" },
      { "from": "api", "to": "metaDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "client", "to": "original", "sourceHandle": "right", "targetHandle": "left", "label": "upload" },
      { "from": "original", "to": "transcode", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "transcode", "to": "transcoded", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "transcoded", "to": "cdn", "sourceHandle": "left", "targetHandle": "right" },
      { "from": "cdn", "to": "client", "sourceHandle": "left", "targetHandle": "bottom", "label": "stream" },
      { "from": "transcode", "to": "queue", "sourceHandle": "right", "targetHandle": "left", "label": "done" },
      { "from": "queue", "to": "handler", "sourceHandle": "top", "targetHandle": "bottom" },
      { "from": "handler", "to": "metaDb", "sourceHandle": "left", "targetHandle": "right", "label": "update" }
    ]
  },
  {
    "id": "cloud-file-storage",
    "name": "Cloud File Storage",
    "group": "system-design",
    "description": "Block servers split, compress and encrypt files before cloud storage. API servers track metadata, and a notification service tells other clients when a file changes.",
    "nodes": [
      { "key": "block", "label": "Block Servers", "shape": "rectangle", "color": "Teal", "x": 270, "y": 16 },
      { "key": "storage", "label": "Cloud Storage", "shape": "cylinder", "color": "Neutral", "x": 564, "y": 0 },
      { "key": "cold", "label": "Cold Storage", "shape": "cylinder", "color": "Neutral", "x": 834, "y": 0 },
      { "key": "client", "label": "Client", "shape": "pill", "color": "Blue", "x": 0, "y": 224 },
      { "key": "lb", "label": "Load Balancer", "shape": "diamond", "color": "Purple", "x": 262, "y": 200, "width": 176, "height": 112 },
      { "key": "api", "label": "API Servers", "shape": "rectangle", "color": "Teal", "x": 540, "y": 216 },
      { "key": "metaCache", "label": "Metadata Cache", "shape": "cylinder", "color": "Pink", "x": 826, "y": 200, "width": 128, "height": 112 },
      { "key": "metaDb", "label": "Metadata DB", "shape": "cylinder", "color": "Neutral", "x": 1060, "y": 200, "width": 128, "height": 112 },
      { "key": "notify", "label": "Notification Service", "shape": "rectangle", "color": "Green", "x": 270, "y": 426 },
      { "key": "queue", "label": "Offline Backup Queue", "shape": "hexagon", "color": "Orange", "x": 548, "y": 418 }
    ],
    "edges": [
      { "from": "client", "to": "block", "sourceHandle": "top", "targetHandle": "left", "label": "file blocks" },
      { "from": "block", "to": "storage", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "storage", "to": "cold", "sourceHandle": "right", "targetHandle": "left", "label": "inactive" },
      { "from": "client", "to": "lb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "lb", "to": "api", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "metaCache", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "metaCache", "to": "metaDb", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "api", "to": "notify", "sourceHandle": "bottom", "targetHandle": "top", "label": "file changed" },
      { "from": "notify", "to": "client", "sourceHandle": "left", "targetHandle": "bottom", "label": "long poll" },
      { "from": "notify", "to": "queue", "sourceHandle": "right", "targetHandle": "left" }
    ]
  },
  {
    "id": "notification-system",
    "name": "Notification System",
    "group": "system-design",
    "description": "Services send requests to notification servers, which queue one message per channel. Workers deliver them through the push, SMS and email providers.",
    "nodes": [
      { "key": "services", "label": "Services", "shape": "rectangle", "color": "Blue", "x": 0, "y": 218 },
      { "key": "server", "label": "Notification Servers", "shape": "rectangle", "color": "Teal", "x": 250, "y": 218 },
      { "key": "db", "label": "User and Device DB", "shape": "cylinder", "color": "Neutral", "x": 266, "y": 400, "width": 128, "height": 112 },
      { "key": "iosQ", "label": "iOS Queue", "shape": "hexagon", "color": "Orange", "x": 500, "y": 0 },
      { "key": "androidQ", "label": "Android Queue", "shape": "hexagon", "color": "Orange", "x": 500, "y": 140 },
      { "key": "smsQ", "label": "SMS Queue", "shape": "hexagon", "color": "Orange", "x": 500, "y": 280 },
      { "key": "emailQ", "label": "Email Queue", "shape": "hexagon", "color": "Orange", "x": 500, "y": 420 },
      { "key": "workers", "label": "Workers", "shape": "rectangle", "color": "Green", "x": 740, "y": 218 },
      { "key": "apns", "label": "APNs", "shape": "rectangle", "color": "Pink", "x": 990, "y": 8 },
      { "key": "fcm", "label": "FCM", "shape": "rectangle", "color": "Pink", "x": 990, "y": 148 },
      { "key": "sms", "label": "SMS Provider", "shape": "rectangle", "color": "Pink", "x": 990, "y": 288 },
      { "key": "email", "label": "Email Provider", "shape": "rectangle", "color": "Pink", "x": 990, "y": 428 }
    ],
    "edges": [
      { "from": "services", "to": "server", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "server", "to": "db", "sourceHandle": "bottom", "targetHandle": "top" },
      { "from": "server", "to": "iosQ", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "server", "to": "androidQ", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "server", "to": "smsQ", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "server", "to": "emailQ", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "iosQ", "to": "workers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "androidQ", "to": "workers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "smsQ", "to": "workers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "emailQ", "to": "workers", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "workers", "to": "apns", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "workers", "to": "fcm", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "workers", "to": "sms", "sourceHandle": "right", "targetHandle": "left" },
      { "from": "workers", "to": "email", "sourceHandle": "right", "targetHandle": "left" }
    ]
  }
```

How this data was checked by the spec author (2026-11-14), so nobody needs to re-derive it: a script ran every template through the production `applyOps`, computed every edge's route with React Flow's own `getSmoothStepPath`, and confirmed that no two nodes are closer than 40 units, no edge route passes through a node, no edge label box touches a node or another label, and every node label fits its shape's label area at the estimated text width. The layouts were also rendered and looked at. Font metrics in the real app can still differ from the estimate, which is why the manual checklist asks for a look at each one.

## 2. `lib/canvasTemplates.js`: edge labels

Two small changes to the functions. Their signatures, placement rules and return values stay the same.

- **`templateBounds`** already returns `null` for an edge that is missing or points at an unknown key. Extend that same check: an edge whose `label` is present and is not a string also makes it return `null`. An absent `label` is valid. Length is not checked here; `applyOps` inside `dispatch` already rejects a label over `EDGE_LABEL_MAX` and toasts.
- **`buildTemplateOps`** writes `data: { label: edge.label ?? "" }` on each `edge.add` in place of the fixed empty string.

`group` is not validated by either function: a template object without a group still builds.

Do not add an import. Do not touch `TEMPLATE_GAP`, `sizeOf`, `boxOf`, or the placement code.

## 3. `components/canvas/TemplatesDialog.jsx`

Import `TEMPLATE_GROUPS` beside `CANVAS_TEMPLATES`. Replace the flat list with one section per group, in `TEMPLATE_GROUPS` order. Inside a group, cards keep `CANVAS_TEMPLATES` order.

```jsx
<div className="mt-6 max-h-[60vh] space-y-6 overflow-y-auto">
  {TEMPLATE_GROUPS.map((group) => (
    <section key={group.id} aria-labelledby={`${id}-${group.id}`} className="space-y-4">
      <h3 id={`${id}-${group.id}`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">{group.title}</h3>
      {CANVAS_TEMPLATES.filter((template) => template.group === group.id).map((template) => (
        /* the existing <article> card */
      ))}
    </section>
  ))}
</div>
```

- The group heading uses the Eyebrow style from `3-ui-context.md`.
- Because the group title is now the `h3`, the template name inside each card becomes an `h4`, with the same classes it has now (`text-base font-semibold`).
- The card is otherwise unchanged: preview, name, description, and the `Add to canvas` button with `aria-label={`Add ${template.name} template`}`.
- The title, the line under it, the Close button with `data-autofocus`, and `TemplatePreview` are unchanged. The preview does not draw edge labels.

No raw hex, no Tailwind palette colors, no new listener.

## 4. Tests: `test/canvasTemplates.test.mjs`

Keep the harness (`before`, `after`, port 24930, the `Dialog.jsx` portal rewrite) as it is. Update the existing tests where the numbers changed, and add the new ones. Every test that loops over `CANVAS_TEMPLATES` now covers all eleven.

**Data**

1. The ids are exactly, in order: `microservices`, `cicd-pipeline`, `event-driven`, `scale-to-millions`, `rate-limiter`, `url-shortener`, `news-feed`, `chat-system`, `video-streaming`, `cloud-file-storage`, `notification-system`. Each has a non-empty name and description. The array and its contents are deeply frozen.
2. `TEMPLATE_GROUPS` deep-equals the two entries in section 1, in order, and is deeply frozen. The first three templates have group `patterns` and the other eight `system-design`.
3. **Fingerprints.** With `createHash` from `node:crypto`, use exactly this function and assert each template's value against the table. This replaces a value-by-value comparison for all eleven.

   ```js
   const fingerprint = (t) => createHash("sha256").update(JSON.stringify([
     t.id, t.name, t.description, t.group,
     t.nodes.map((n) => [n.key, n.label, n.shape, n.color, n.x, n.y, n.width ?? null, n.height ?? null]),
     t.edges.map((e) => [e.from, e.to, e.sourceHandle, e.targetHandle, e.label ?? null]),
   ])).digest("hex").slice(0, 16);
   ```

   | id | nodes | edges | labelled edges | fingerprint |
   | --- | --- | --- | --- | --- |
   | `microservices` | 7 | 6 | 0 | `824ce8b514cc8a64` |
   | `cicd-pipeline` | 7 | 6 | 0 | `da41e2c6faaf8250` |
   | `event-driven` | 7 | 7 | 0 | `a616d5a4f436b6f9` |
   | `scale-to-millions` | 10 | 10 | 5 | `a3fadbf82411b1dd` |
   | `rate-limiter` | 8 | 7 | 5 | `e6412edaf40c8887` |
   | `url-shortener` | 6 | 6 | 4 | `d7711ec480c343d7` |
   | `news-feed` | 11 | 11 | 3 | `e2141dd1a39f213d` |
   | `chat-system` | 10 | 9 | 5 | `9fb773ccb83911a3` |
   | `video-streaming` | 9 | 10 | 5 | `a06c43907f34c24a` |
   | `cloud-file-storage` | 10 | 10 | 4 | `f9615ed270a75e8c` |
   | `notification-system` | 12 | 14 | 0 | `95807d018cb802fa` |

   Assert the node, edge and labelled-edge counts from the same table. **If a fingerprint does not match, the data in `canvasTemplates.js` is wrong. Fix the data. Never change an expected fingerprint.** If you believe the table itself is wrong, stop and record an open question.
4. The existing structure checks (unique keys, shapes, colors, label length, edge keys, handles, no overlapping rectangles) run for all eleven. Add, for all eleven: an edge `label`, when present, is a non-empty string of at most `EDGE_LABEL_MAX` characters; no two edges of a template share the same `from` and `to`; `nodes.length + edges.length <= MAX_OPS_PER_COMMIT`.
5. For the eight `system-design` templates: the smallest node `x` is 0 and the smallest node `y` is 0, and any two node rectangles are at least 40 units apart (they do not overlap even when one is grown by 40 on every side).

**Builder**

6. The existing builder tests run for all eleven, with the hard-coded `7` replaced by `t.nodes.length`: the real `applyOps` accepts the ops on an empty canvas with the right node and edge counts; empty-canvas centering; placement below existing content; fresh ids and double insertion; the `invertOps` round trip back to an empty canvas.
7. Edge labels: in the built ops, and in the canvas `applyOps` returns, edge `i` has `data.label` equal to the template edge's `label`, or `""` when it has none. Every edge is still `type: "link"`.
8. `buildTemplateOps` returns `null` for a template whose edge has `label: 5`. A template whose edge label is 101 characters long still builds, and the real `applyOps` rejects those ops with nothing applied. The existing malformed-input cases still pass, and frozen inputs are not mutated.
9. The node-limit test (295 existing nodes) is unchanged.

**Markup**

10. `TemplatesDialog`: the title; exactly two group headings, `Architecture patterns` then `System design classics`, each an `h3`; eleven template names, each an `h4`, in `CANVAS_TEMPLATES` order; the first three names sit between the two headings and the other eight after the second; eleven buttons labelled `Add <name> template`; the Close button with `data-autofocus`. `open={false}` renders nothing.
11. Eleven previews, each an `aria-hidden` SVG with one node element per template node and one `line` per edge.
12. The `ShapePanel` test is unchanged.

Static markup does not run the click, insert or `fitBounds` handlers, as in S31. Say so in the slice note.

## 5. Things that stay true

- Every canvas change goes through `dispatch`. One template is one dispatch.
- After insertion the nodes and edges are ordinary ones. Nothing template-specific is stored, and the edge labels are ordinary edge labels the holder can edit or clear.
- `canvasTemplates.js` imports only from `@shared/canvasOps.js`. Nothing outside `src/collaborate/` imports it.
- No import from `src/chat/` or `src/blog/`. No server change, no new socket event, payload or limit.
- The three S31 templates are unchanged apart from `group`.

## 6. Documentation

- `context/1-project-overview.md`: change the starter templates line under Collaborative Canvas to say eleven templates in two groups: three architecture patterns (Microservices, CI/CD Pipeline, Event-Driven System) and eight system design classics (name them).
- `context/2-architecture.md`: one sentence that template edges may carry a label and that templates are grouped by `TEMPLATE_GROUPS`; checkpoint line.
- `context/3-ui-context.md`: a short `### S32` section: the dialog shows two groups with Eyebrow headings, group title `h3` and template name `h4`, eleven cards in one scrolling list.
- `context/specs/00-build-plan.md`: mark S32 implemented in Phase L.
- `readme.md`: reword the existing **Starter Templates** bullet in place, keeping its format: the turn holder can drop a ready-made diagram onto the canvas, from three architecture patterns (Microservices, CI/CD Pipeline, Event-Driven) and eight system design classics such as a URL shortener, a chat system and a news feed.
- Tracker and HANDOFF: status, slice note, what was not run.

## Verify when done

- [ ] `node --test test/canvasTemplates.test.mjs` passes. Report the count (baseline 10).
- [ ] Each of the twelve other root suites passes in its own command, unchanged. Report each count (baseline 293).
- [ ] `cd server && npm test` still passes 328.
- [ ] `npm run build` passes with no new warnings. Report the entry, `Collaborate` and `WorkspacePage` chunk sizes. The entry chunk must not grow; `WorkspacePage` grows by the template data only.
- [ ] `git diff --check` passes, and `git diff --stat` shows only this spec's allowed files on top of anything earlier slices left uncommitted.
- [ ] `canvasTemplates.js` still has one import line, from `@shared/canvasOps.js`.
- [ ] No raw hex in `TemplatesDialog.jsx`.
- [ ] A search of `src/` and `readme.md` finds none of: `Alex Xu`, `System Design Interview`, `YouTube`, `Google Drive`. (The context files may keep naming the book as the source of the topic list.)

**Manual checklist.** Record each line as passed or **not run**. Do not create live projects to satisfy it.

- [ ] The dialog shows two headings and eleven cards, and scrolls with the mouse, touch and the Tab key.
- [ ] Each of the eight new templates, added to an empty canvas: lands centered, the view fits it, every node label fits inside its shape, no edge label covers a node, and the arrows read in the intended direction.
- [ ] In Scaling to Millions of Users, Rate Limiter, News Feed System and Notification System, the edges that fan out from one handle are readable.
- [ ] One Undo removes a whole new template, edge labels included; Redo brings it back; a watcher's canvas matches after each step.
- [ ] An inserted edge label can be edited and cleared like any other.
- [ ] A new template added to a canvas with content lands below it and nothing is moved.
- [ ] The three S31 templates still insert as before.
- [ ] At 320px wide the dialog still scrolls and the cards are readable.

## Review checklist (for the reviewer)

Rerun every command above yourself. Then check:

1. The fingerprint function in the test is character for character the one in section 4, and the expected values are the table's. A passing fingerprint test then proves all eleven templates match this spec, so no value-by-value comparison is needed.
2. The three S31 templates differ from before only by `"group": "patterns"`.
3. `templateBounds` and `buildTemplateOps` changed only as section 2 says; placement code is byte-identical.
4. `TemplatesDialog.jsx` changed only as section 3 says; `ShapePanel.jsx`, `Dialog.jsx`, `EmptyCanvasHint.jsx`, the store and `test/mobileA11y.test.mjs` are untouched by this slice.
5. No name, description, label or UI string mentions the book, its author, YouTube or Google Drive.
6. No server file changed, and no dependency was added.
7. The slice note claims no browser check that was not run.
