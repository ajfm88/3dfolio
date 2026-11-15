import { createNodeId, createEdgeId, DEFAULT_NODE_SIZE, NODE_COLORS, MAX_OPS_PER_COMMIT } from "@shared/canvasOps.js";

function freezeDeep(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

export const TEMPLATE_GROUPS = freezeDeep([
  { id: "patterns", title: "Architecture patterns" },
  { id: "foundations", title: "Web foundations" },
  { id: "social", title: "Social and messaging" },
  { id: "media-storage", title: "Media and storage" },
  { id: "search-location", title: "Search and location" },
  { id: "payments", title: "Payments and booking" },
  { id: "data", title: "Data and streaming" },
]);

export const CANVAS_TEMPLATES = freezeDeep([
  {
    "id": "microservices",
    "group": "patterns",
    "name": "Microservices",
    "description": "An API gateway routes requests to separate services. The user and order services each own a database.",
    "nodes": [
      {
        "key": "gateway",
        "label": "API Gateway",
        "shape": "rectangle",
        "color": "Blue",
        "x": 330,
        "y": 0
      },
      {
        "key": "auth",
        "label": "Auth Service",
        "shape": "pill",
        "color": "Purple",
        "x": 0,
        "y": 188
      },
      {
        "key": "users",
        "label": "User Service",
        "shape": "rectangle",
        "color": "Teal",
        "x": 220,
        "y": 180
      },
      {
        "key": "orders",
        "label": "Order Service",
        "shape": "rectangle",
        "color": "Orange",
        "x": 440,
        "y": 180
      },
      {
        "key": "payments",
        "label": "Payment Service",
        "shape": "rectangle",
        "color": "Pink",
        "x": 660,
        "y": 180
      },
      {
        "key": "usersDb",
        "label": "User DB",
        "shape": "cylinder",
        "color": "Neutral",
        "x": 244,
        "y": 360
      },
      {
        "key": "ordersDb",
        "label": "Order DB",
        "shape": "cylinder",
        "color": "Neutral",
        "x": 464,
        "y": 360
      }
    ],
    "edges": [
      {
        "from": "gateway",
        "to": "auth",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      },
      {
        "from": "gateway",
        "to": "users",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      },
      {
        "from": "gateway",
        "to": "orders",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      },
      {
        "from": "gateway",
        "to": "payments",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      },
      {
        "from": "users",
        "to": "usersDb",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      },
      {
        "from": "orders",
        "to": "ordersDb",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      }
    ]
  },
  {
    "id": "cicd-pipeline",
    "group": "patterns",
    "name": "CI/CD Pipeline",
    "description": "A commit moves through build, tests and packaging, then to staging, integration tests and production.",
    "nodes": [
      {
        "key": "source",
        "label": "Source Code",
        "shape": "rectangle",
        "color": "Blue",
        "x": 0,
        "y": 16
      },
      {
        "key": "build",
        "label": "Build",
        "shape": "rectangle",
        "color": "Orange",
        "x": 230,
        "y": 16
      },
      {
        "key": "test",
        "label": "Test Suite",
        "shape": "diamond",
        "color": "Green",
        "x": 460,
        "y": 0,
        "width": 176,
        "height": 112
      },
      {
        "key": "package",
        "label": "Package",
        "shape": "rectangle",
        "color": "Blue",
        "x": 706,
        "y": 16
      },
      {
        "key": "staging",
        "label": "Deploy Staging",
        "shape": "rectangle",
        "color": "Orange",
        "x": 936,
        "y": 16
      },
      {
        "key": "integration",
        "label": "Integration Tests",
        "shape": "diamond",
        "color": "Purple",
        "x": 1166,
        "y": 0,
        "width": 176,
        "height": 112
      },
      {
        "key": "production",
        "label": "Deploy Production",
        "shape": "rectangle",
        "color": "Teal",
        "x": 1412,
        "y": 16
      }
    ],
    "edges": [
      {
        "from": "source",
        "to": "build",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "build",
        "to": "test",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "test",
        "to": "package",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "package",
        "to": "staging",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "staging",
        "to": "integration",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "integration",
        "to": "production",
        "sourceHandle": "right",
        "targetHandle": "left"
      }
    ]
  },
  {
    "id": "event-driven",
    "group": "patterns",
    "name": "Event-Driven System",
    "description": "Producers publish events to a message broker. Consumers process them, an event store keeps a copy, and failures go to a dead letter queue.",
    "nodes": [
      {
        "key": "producerA",
        "label": "Producer A",
        "shape": "rectangle",
        "color": "Blue",
        "x": 0,
        "y": 60
      },
      {
        "key": "producerB",
        "label": "Producer B",
        "shape": "rectangle",
        "color": "Blue",
        "x": 0,
        "y": 220
      },
      {
        "key": "broker",
        "label": "Message Broker",
        "shape": "hexagon",
        "color": "Orange",
        "x": 270,
        "y": 132
      },
      {
        "key": "consumerA",
        "label": "Consumer A",
        "shape": "rectangle",
        "color": "Green",
        "x": 530,
        "y": 60
      },
      {
        "key": "consumerB",
        "label": "Consumer B",
        "shape": "rectangle",
        "color": "Teal",
        "x": 530,
        "y": 220
      },
      {
        "key": "store",
        "label": "Event Store",
        "shape": "cylinder",
        "color": "Neutral",
        "x": 286,
        "y": 320
      },
      {
        "key": "deadLetters",
        "label": "Dead Letter Queue",
        "shape": "rectangle",
        "color": "Red",
        "x": 790,
        "y": 140
      }
    ],
    "edges": [
      {
        "from": "producerA",
        "to": "broker",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "producerB",
        "to": "broker",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "broker",
        "to": "consumerA",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "broker",
        "to": "consumerB",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "consumerA",
        "to": "deadLetters",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "consumerB",
        "to": "deadLetters",
        "sourceHandle": "right",
        "targetHandle": "left"
      },
      {
        "from": "broker",
        "to": "store",
        "sourceHandle": "bottom",
        "targetHandle": "top"
      }
    ]
  },
  {
    "id": "scale-to-millions",
    "name": "Scaling to Millions of Users",
    "group": "foundations",
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
    "group": "foundations",
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
    "group": "foundations",
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
    "group": "social",
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
    "group": "social",
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
    "group": "media-storage",
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
    "group": "media-storage",
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
    "group": "social",
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
  },
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
]);

export const TEMPLATE_GAP = 120;
const sizeOf = (node) => ({ width: node.width ?? DEFAULT_NODE_SIZE[node.shape]?.width, height: node.height ?? DEFAULT_NODE_SIZE[node.shape]?.height });

function boxOf(nodes) {
  const x = Math.min(...nodes.map((node) => node.position.x));
  const y = Math.min(...nodes.map((node) => node.position.y));
  return { x, y, width: Math.max(...nodes.map((node) => node.position.x + node.width)) - x,
    height: Math.max(...nodes.map((node) => node.position.y + node.height)) - y };
}

export function templateBounds(template) {
  if (!template || Array.isArray(template) || !Array.isArray(template.nodes) || !template.nodes.length || !Array.isArray(template.edges)) return null;
  const keys = new Set();
  for (const node of template.nodes) {
    if (!node || !Object.hasOwn(DEFAULT_NODE_SIZE, node.shape) || !NODE_COLORS.some((pair) => pair.name === node.color)
      || typeof node.key !== "string" || keys.has(node.key) || typeof node.label !== "string"
      || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
    const { width, height } = sizeOf(node);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    keys.add(node.key);
  }
  if (template.edges.some((edge) => !edge || !keys.has(edge.from) || !keys.has(edge.to) || (edge.label !== undefined && typeof edge.label !== "string"))) return null;
  return boxOf(template.nodes.map((node) => ({ position: { x: node.x, y: node.y }, ...sizeOf(node) })));
}

export function buildTemplateOps(template, existingNodes, viewCenter) {
  const box = templateBounds(template);
  if (!box || !Array.isArray(existingNodes) || !Number.isFinite(viewCenter?.x) || !Number.isFinite(viewCenter?.y)) return null;
  let x = viewCenter.x - box.width / 2;
  let y = viewCenter.y - box.height / 2;
  if (existingNodes.length) {
    const existing = boxOf(existingNodes);
    x = existing.x + existing.width / 2 - box.width / 2;
    y = existing.y + existing.height + TEMPLATE_GAP;
  }
  const ids = new Map(template.nodes.map((node) => [node.key, createNodeId()]));
  const nodes = template.nodes.map((node) => {
    const pair = NODE_COLORS.find((pair) => pair.name === node.color);
    return { id: ids.get(node.key), type: "shape", position: { x: Math.round(node.x + x - box.x), y: Math.round(node.y + y - box.y) },
      ...sizeOf(node), data: { label: node.label, shape: node.shape, color: pair.fill, textColor: pair.text } };
  });
  const ops = nodes.map((node) => ({ type: "node.add", node }));
  for (const edge of template.edges) ops.push({ type: "edge.add", edge: { id: createEdgeId(), source: ids.get(edge.from), target: ids.get(edge.to),
    sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle, type: "link", data: { label: edge.label ?? "" } } });
  return ops.length > MAX_OPS_PER_COMMIT ? null : { ops, bounds: boxOf(nodes) };
}
