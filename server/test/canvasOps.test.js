import fs from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as canvasOps from "../src/shared/canvasOps.js";
import {
  NODE_SHAPES,
  HANDLE_IDS,
  NODE_COLORS,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
  ID_PATTERN,
  MAX_NODES,
  MAX_EDGES,
  MAX_OPS_PER_COMMIT,
  NODE_LABEL_MAX,
  EDGE_LABEL_MAX,
  NODE_SIZE_MIN,
  NODE_SIZE_MAX,
  POSITION_MAX,
  createNodeId,
  createEdgeId,
  sanitizeNode,
  sanitizeEdge,
  applyOps,
  invertOps,
  normalizeCanvas,
} from "../src/shared/canvasOps.js";

const EXPORTS = [
  "invertOps",
  "NODE_SHAPES",
  "HANDLE_IDS",
  "NODE_COLORS",
  "DEFAULT_NODE_COLOR",
  "DEFAULT_NODE_SIZE",
  "ID_PATTERN",
  "MAX_NODES",
  "MAX_EDGES",
  "MAX_OPS_PER_COMMIT",
  "NODE_LABEL_MAX",
  "EDGE_LABEL_MAX",
  "NODE_SIZE_MIN",
  "NODE_SIZE_MAX",
  "POSITION_MAX",
  "createNodeId",
  "createEdgeId",
  "sanitizeNode",
  "sanitizeEdge",
  "applyOps",
  "normalizeCanvas",
];

function node(overrides = {}) {
  const data = {
    label: "Api",
    shape: "rectangle",
    color: "#1F1F1F",
    textColor: "#EDEDED",
    ...(overrides.data ?? {}),
  };
  return {
    id: "n1",
    type: "shape",
    position: { x: 0, y: 0 },
    width: 160,
    height: 80,
    ...overrides,
    data,
  };
}

function edge(overrides = {}) {
  const data = { label: "", ...(overrides.data ?? {}) };
  return {
    id: "e1",
    source: "n1",
    target: "n2",
    sourceHandle: "right",
    targetHandle: "left",
    type: "link",
    ...overrides,
    data,
  };
}

function blank() {
  return { nodes: [], edges: [] };
}

function assertOk(result) {
  assert.equal(result.ok, true, result.ok ? "" : `${result.error} (index ${result.index})`);
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

describe("constants", () => {
  it("exports exactly the canvas op surface", () => {
    assert.deepEqual(Object.keys(canvasOps).sort(), [...EXPORTS].sort());
  });

  it("freezes every object constant, including nested palette and sizes", () => {
    assert.equal(Object.isFrozen(NODE_SHAPES), true);
    assert.equal(Object.isFrozen(HANDLE_IDS), true);
    assert.equal(Object.isFrozen(NODE_COLORS), true);
    assert.equal(Object.isFrozen(NODE_COLORS[0]), true);
    assert.equal(Object.isFrozen(DEFAULT_NODE_COLOR), true);
    assert.equal(Object.isFrozen(DEFAULT_NODE_SIZE), true);
    assert.equal(Object.isFrozen(DEFAULT_NODE_SIZE.rectangle), true);
    assert.equal(Object.isFrozen(ID_PATTERN), true);
    assert.throws(() => {
      NODE_SHAPES[0] = "square";
    }, TypeError);
    assert.throws(() => {
      NODE_COLORS[0].fill = "#000000";
    }, TypeError);
    assert.throws(() => {
      DEFAULT_NODE_SIZE.circle.width = 10;
    }, TypeError);
  });

  it("lists the eight palette pairs with neutral first", () => {
    assert.equal(NODE_COLORS.length, 8);
    assert.equal(DEFAULT_NODE_COLOR, NODE_COLORS[0]);
    assert.deepEqual(NODE_COLORS, [
      { name: "Neutral", fill: "#1F1F1F", text: "#EDEDED" },
      { name: "Blue", fill: "#10233D", text: "#52A8FF" },
      { name: "Purple", fill: "#2E1938", text: "#BF7AF0" },
      { name: "Orange", fill: "#331B00", text: "#FF990A" },
      { name: "Red", fill: "#3C1618", text: "#FF6166" },
      { name: "Pink", fill: "#3A1726", text: "#F75F8F" },
      { name: "Green", fill: "#0F2E18", text: "#62C073" },
      { name: "Teal", fill: "#062822", text: "#0AC7B4" },
    ]);
  });

  it("gives every shape a default size inside the allowed range", () => {
    assert.deepEqual(DEFAULT_NODE_SIZE, {
      rectangle: { width: 160, height: 80 },
      pill: { width: 160, height: 64 },
      circle: { width: 96, height: 96 },
      diamond: { width: 144, height: 96 },
      hexagon: { width: 144, height: 96 },
      cylinder: { width: 112, height: 112 },
    });
    assert.deepEqual([...Object.keys(DEFAULT_NODE_SIZE)].sort(), [...NODE_SHAPES].sort());
    for (const shape of NODE_SHAPES) {
      const size = DEFAULT_NODE_SIZE[shape];
      assert.equal(size.width >= NODE_SIZE_MIN && size.width <= NODE_SIZE_MAX, true);
      assert.equal(size.height >= NODE_SIZE_MIN && size.height <= NODE_SIZE_MAX, true);
    }
  });

  it("matches the architecture limits", () => {
    assert.equal(MAX_NODES, 300);
    assert.equal(MAX_EDGES, 600);
    assert.equal(MAX_OPS_PER_COMMIT, 50);
    assert.equal(NODE_LABEL_MAX, 200);
    assert.equal(EDGE_LABEL_MAX, 100);
    assert.equal(NODE_SIZE_MIN, 40);
    assert.equal(NODE_SIZE_MAX, 2000);
    assert.equal(POSITION_MAX, 100000);
    assert.deepEqual(HANDLE_IDS, ["top", "right", "bottom", "left"]);
  });

  it("accepts and rejects ids", () => {
    for (const id of ["a", "Z", "A_b-c", "n_01234567-89ab-cdef-0123-456789abcdef", "a".repeat(64), "__proto__", "constructor"]) {
      assert.equal(ID_PATTERN.test(id), true, id);
    }
    for (const id of ["", "a".repeat(65), "has space", "a.b", "a/b", "ü", "a\n"]) {
      assert.equal(ID_PATTERN.test(id), false, id);
    }
  });
});

describe("ids", () => {
  it("prefixes uuid ids and never repeats one in 1,000 calls", () => {
    const nodeIds = new Set();
    const edgeIds = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const nodeId = createNodeId();
      const edgeId = createEdgeId();
      assert.match(nodeId, /^n_[0-9a-f-]{36}$/);
      assert.match(edgeId, /^e_[0-9a-f-]{36}$/);
      assert.equal(ID_PATTERN.test(nodeId), true);
      assert.equal(ID_PATTERN.test(edgeId), true);
      nodeIds.add(nodeId);
      edgeIds.add(edgeId);
    }
    assert.equal(nodeIds.size, 1000);
    assert.equal(edgeIds.size, 1000);
  });
});

describe("sanitizeNode", () => {
  it("rebuilds a valid node and drops extra fields", () => {
    const raw = node({
      type: "not-a-shape",
      selected: true,
      position: { x: 1.5, y: -2, z: 9 },
      data: { label: "Hi", shape: "circle", color: "#abc123", textColor: "#ededed", extra: 1 },
    });
    const result = sanitizeNode(raw);
    assert.equal(result.ok, true);
    assert.deepEqual(result.node, {
      id: "n1",
      type: "shape",
      position: { x: 1.5, y: -2 },
      width: 160,
      height: 80,
      data: { label: "Hi", shape: "circle", color: "#ABC123", textColor: "#EDEDED" },
    });
    assert.equal(raw.selected, true);
    assert.equal(raw.type, "not-a-shape");
    assert.equal(raw.data.extra, 1);
    assert.notEqual(result.node, raw);
    assert.notEqual(result.node.data, raw.data);
    assert.notEqual(result.node.position, raw.position);
  });

  it("defaults a missing label and missing colors to the neutral pair", () => {
    const result = sanitizeNode(node({ data: { label: undefined, color: undefined, textColor: undefined, shape: "pill" } }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.node.data, {
      label: "",
      shape: "pill",
      color: DEFAULT_NODE_COLOR.fill,
      textColor: DEFAULT_NODE_COLOR.text,
    });
  });

  it("accepts a size and position exactly at the limits, including fractions", () => {
    const result = sanitizeNode(node({
      position: { x: POSITION_MAX, y: -POSITION_MAX },
      width: NODE_SIZE_MIN,
      height: NODE_SIZE_MAX,
    }));
    assert.equal(result.ok, true);
    assert.equal(sanitizeNode(node({ width: 40.5 })).ok, true);
  });

  it("names each invalid field", () => {
    const cases = [
      [node({ id: "bad id" }), /id/i],
      [node({ position: { x: Number.NaN, y: 0 } }), /position x/i],
      [node({ position: { x: Number.POSITIVE_INFINITY, y: 0 } }), /position x/i],
      [node({ position: { x: "10", y: 0 } }), /position x/i],
      [node({ position: { x: true, y: 0 } }), /position x/i],
      [node({ position: { x: POSITION_MAX + 1, y: 0 } }), /position x/i],
      [node({ position: { x: 0, y: -POSITION_MAX - 1 } }), /position y/i],
      [node({ width: 39 }), /width/i],
      [node({ width: 2001 }), /width/i],
      [node({ height: 39 }), /height/i],
      [node({ data: { shape: "triangle" } }), /shape/i],
      [node({ data: { label: "a".repeat(201) } }), /label/i],
      [node({ data: { label: 5 } }), /label/i],
      [node({ data: { color: "red" } }), /color/i],
      [node({ data: { color: "#fff" } }), /color/i],
      [node({ data: { color: "#GGGGGG" } }), /color/i],
      [node({ data: { textColor: "blue" } }), /text color/i],
    ];
    for (const [raw, pattern] of cases) {
      const result = sanitizeNode(raw);
      assert.equal(result.ok, false, JSON.stringify(raw));
      assert.match(result.error, pattern);
    }
    assert.equal(sanitizeNode(node({ data: { label: "a".repeat(200) } })).ok, true);
    assert.equal(sanitizeNode(node({ width: 40, height: 2000 })).ok, true);
  });

  it("truncates a long label and still rejects other bad fields", () => {
    const truncated = sanitizeNode(node({ data: { label: `x${"a".repeat(200)}` } }), { truncate: true });
    assert.equal(truncated.ok, true);
    assert.equal(truncated.node.data.label, `x${"a".repeat(199)}`);
    const stillBad = sanitizeNode(node({ width: 39, data: { label: "a".repeat(201) } }), { truncate: true });
    assert.equal(stillBad.ok, false);
    assert.match(stillBad.error, /width/i);
  });

  it("rejects non-objects without throwing", () => {
    for (const raw of [null, [], "x", 5]) {
      const result = sanitizeNode(raw);
      assert.equal(result.ok, false);
      assert.match(result.error, /object/i);
    }
  });
});

describe("sanitizeEdge", () => {
  it("rebuilds a valid edge and forces the link type", () => {
    const raw = edge({
      type: "bezier",
      sourceHandle: undefined,
      targetHandle: "bottom",
      markerEnd: "arrow",
      data: { label: "to", style: 1 },
    });
    const result = sanitizeEdge(raw);
    assert.equal(result.ok, true);
    assert.deepEqual(result.edge, {
      id: "e1",
      source: "n1",
      target: "n2",
      sourceHandle: null,
      targetHandle: "bottom",
      type: "link",
      data: { label: "to" },
    });
    assert.equal(raw.markerEnd, "arrow");
  });

  it("accepts every handle, a missing data object, and a self-loop", () => {
    for (const handle of HANDLE_IDS) {
      const result = sanitizeEdge(edge({ sourceHandle: handle, targetHandle: handle }));
      assert.equal(result.ok, true);
      assert.equal(result.edge.sourceHandle, handle);
    }
    assert.equal(sanitizeEdge(edge({ sourceHandle: null, targetHandle: null })).ok, true);
    const unlabeled = edge();
    delete unlabeled.data;
    const missingData = sanitizeEdge(unlabeled);
    assert.equal(missingData.ok, true);
    assert.deepEqual(missingData.edge.data, { label: "" });
    const loop = sanitizeEdge(edge({ source: "n1", target: "n1" }));
    assert.equal(loop.ok, true);
    assert.equal(loop.edge.source, loop.edge.target);
  });

  it("rejects a bad handle, a bad id, and a label past the limit", () => {
    assert.match(sanitizeEdge(edge({ sourceHandle: "middle" })).error, /source handle/i);
    assert.match(sanitizeEdge(edge({ targetHandle: "" })).error, /target handle/i);
    assert.match(sanitizeEdge(edge({ id: "bad id" })).error, /id/i);
    assert.match(sanitizeEdge(edge({ source: "bad id" })).error, /source/i);
    assert.match(sanitizeEdge(edge({ target: "bad/id" })).error, /target/i);
    assert.equal(sanitizeEdge(edge({ data: { label: "a".repeat(100) } })).ok, true);
    assert.match(sanitizeEdge(edge({ data: { label: "a".repeat(101) } })).error, /label/i);
    for (const raw of [null, [], "x", 5]) {
      assert.equal(sanitizeEdge(raw).ok, false);
    }
  });

  it("truncates a long edge label only when asked", () => {
    const long = "a".repeat(101);
    assert.equal(sanitizeEdge(edge({ data: { label: long } }), { truncate: true }).edge.data.label.length, 100);
  });
});

describe("applyOps", () => {
  it("adds, updates, and removes nodes and edges", () => {
    const added = assertOk(applyOps(blank(), [
      { type: "node.add", node: node({ id: "a" }) },
      { type: "node.add", node: node({ id: "b", position: { x: 10, y: 20 } }) },
      { type: "edge.add", edge: edge({ id: "ab", source: "a", target: "b", data: { label: "calls" } }) },
    ]));
    assert.deepEqual(added.canvas.nodes.map((item) => item.id), ["a", "b"]);
    assert.equal(added.canvas.edges[0].data.label, "calls");
    assert.deepEqual(added.ops[2], {
      type: "edge.add",
      edge: {
        id: "ab",
        source: "a",
        target: "b",
        sourceHandle: "right",
        targetHandle: "left",
        type: "link",
        data: { label: "calls" },
      },
    });

    const updated = assertOk(applyOps(added.canvas, [
      { type: "node.update", id: "a", patch: { position: { x: 4, y: 5 } } },
      { type: "node.update", id: "a", patch: { width: 40 } },
      { type: "node.update", id: "a", patch: { height: 2000 } },
      { type: "node.update", id: "a", patch: { data: { label: "Gateway" } } },
      { type: "node.update", id: "a", patch: { data: { shape: "hexagon" } } },
      { type: "node.update", id: "a", patch: { data: { color: "#abc123" } } },
      { type: "node.update", id: "a", patch: { data: { textColor: "#00ff00" } } },
      { type: "edge.update", id: "ab", patch: { data: { label: "uses" } } },
    ]));
    const finalNode = updated.canvas.nodes[0];
    assert.deepEqual(finalNode.position, { x: 4, y: 5 });
    assert.equal(finalNode.width, 40);
    assert.equal(finalNode.height, 2000);
    assert.equal(finalNode.data.label, "Gateway");
    assert.equal(finalNode.data.shape, "hexagon");
    assert.equal(finalNode.data.color, "#ABC123");
    assert.equal(finalNode.data.textColor, "#00FF00");
    assert.equal(updated.canvas.edges[0].data.label, "uses");

    const removed = assertOk(applyOps(updated.canvas, [
      { type: "edge.remove", id: "ab" },
      { type: "node.remove", id: "b" },
    ]));
    assert.deepEqual(removed.canvas.edges, []);
    assert.deepEqual(removed.canvas.nodes.map((item) => item.id), ["a"]);
  });

  it("keeps unspecified data fields when a data patch names only one", () => {
    const result = assertOk(applyOps({ nodes: [node({ id: "a" })], edges: [] }, [
      { type: "node.update", id: "a", patch: { data: { label: "Only" } } },
    ]));
    assert.deepEqual(result.canvas.nodes[0].data, {
      label: "Only",
      shape: "rectangle",
      color: "#1F1F1F",
      textColor: "#EDEDED",
    });
    assert.deepEqual(result.ops[0], {
      type: "node.update",
      id: "a",
      patch: { data: { label: "Only" } },
    });
  });

  it("drops unknown patch keys and rejects an empty change or a partial position", () => {
    const start = { nodes: [node({ id: "a" })], edges: [] };
    const ignored = assertOk(applyOps(start, [
      { type: "node.update", id: "a", patch: { id: "other", type: "nope", width: 50 } },
    ]));
    assert.equal(ignored.canvas.nodes[0].id, "a");
    assert.equal(ignored.canvas.nodes[0].width, 50);
    assert.deepEqual(ignored.ops[0].patch, { width: 50 });

    const nothing = applyOps(start, [
      { type: "node.update", id: "a", patch: { id: "other", type: "nope", selected: true, data: { rogue: 1 } } },
    ]);
    assert.equal(nothing.ok, false);
    assert.equal(nothing.error, "Nothing to change");
    assert.equal(nothing.index, 0);

    const partial = applyOps(start, [
      { type: "node.update", id: "a", patch: { position: { x: 1 } } },
    ]);
    assert.equal(partial.ok, false);
    assert.match(partial.error, /position/i);

    const edgeNothing = applyOps(
      { nodes: [node({ id: "a" }), node({ id: "b" })], edges: [edge({ id: "ab", source: "a", target: "b" })] },
      [{ type: "edge.update", id: "ab", patch: { label: "nope" } }],
    );
    assert.equal(edgeNothing.error, "Nothing to change");
  });

  it("cascades edges when a node is removed and leaves unrelated edges", () => {
    const result = assertOk(applyOps({
      nodes: [node({ id: "a" }), node({ id: "b" }), node({ id: "c" })],
      edges: [
        edge({ id: "ab", source: "a", target: "b" }),
        edge({ id: "bc", source: "b", target: "c" }),
        edge({ id: "ca", source: "c", target: "a" }),
      ],
    }, [{ type: "node.remove", id: "b" }]));
    assert.deepEqual(result.canvas.nodes.map((item) => item.id), ["a", "c"]);
    assert.deepEqual(result.canvas.edges.map((item) => item.id), ["ca"]);
    assert.deepEqual(result.ops[0], { type: "node.remove", id: "b" });
  });

  it("rejects duplicate ids and missing endpoints, in batch order", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" })];
    assert.match(applyOps({ nodes, edges: [] }, [
      { type: "node.add", node: node({ id: "a" }) },
    ]).error, /already used/i);
    assert.match(applyOps({ nodes, edges: [edge({ id: "ab", source: "a", target: "b" })] }, [
      { type: "edge.add", edge: edge({ id: "ab", source: "a", target: "b" }) },
    ]).error, /already used/i);
    assert.match(applyOps(blank(), [
      { type: "edge.add", edge: edge({ id: "early", source: "a", target: "b" }) },
    ]).error, /source/i);

    const ordered = assertOk(applyOps(blank(), [
      { type: "node.add", node: node({ id: "a" }) },
      { type: "node.add", node: node({ id: "b" }) },
      { type: "edge.add", edge: edge({ id: "ab", source: "a", target: "b" }) },
    ]));
    assert.equal(ordered.canvas.edges.length, 1);

    assert.equal(applyOps({ nodes, edges: [] }, [
      { type: "node.update", id: "missing", patch: { width: 50 } },
    ]).error, "Node not found");
    assert.equal(applyOps({ nodes, edges: [] }, [
      { type: "node.remove", id: "missing" },
    ]).error, "Node not found");
    assert.equal(applyOps({ nodes, edges: [] }, [
      { type: "edge.remove", id: "missing" },
    ]).error, "Edge not found");
  });

  it("allows a self-loop and more than one edge between the same pair", () => {
    const result = assertOk(applyOps(blank(), [
      { type: "node.add", node: node({ id: "a" }) },
      { type: "edge.add", edge: edge({ id: "loop", source: "a", target: "a", sourceHandle: "top", targetHandle: "right" }) },
      { type: "edge.add", edge: edge({ id: "again", source: "a", target: "a", sourceHandle: "bottom", targetHandle: "left" }) },
    ]));
    assert.deepEqual(result.canvas.edges.map((item) => item.id), ["loop", "again"]);
  });

  it("rejects a non-array, empty, or oversized batch before applying anything", () => {
    const canvas = { nodes: [node({ id: "a", data: { label: "Stay" } })], edges: [], version: 3 };
    const snapshot = structuredClone(canvas);
    for (const ops of [null, {}, "ops", 5]) {
      const result = applyOps(canvas, ops);
      assert.equal(result.ok, false);
      assert.equal(result.error, "Ops must be a list");
      assert.equal(result.index, -1);
      assert.equal(result.canvas, undefined);
    }
    const empty = applyOps(canvas, []);
    assert.equal(empty.error, "Nothing to apply");
    assert.equal(empty.index, -1);
    const tooMany = applyOps(canvas, Array.from({ length: 51 }, () => ({ type: "node.remove", id: "a" })));
    assert.equal(tooMany.error, "Too many changes at once");
    assert.equal(tooMany.index, -1);
    assert.equal(tooMany.canvas, undefined);
    assert.deepEqual(canvas, snapshot);

    const fifty = assertOk(applyOps(blank(), Array.from({ length: 50 }, (_, index) => ({
      type: "node.add",
      node: node({ id: `n${index}` }),
    }))));
    assert.equal(fifty.canvas.nodes.length, 50);
  });

  it("applies a batch atomically", () => {
    const canvas = { nodes: [node({ id: "keep", data: { label: "Stay" } })], edges: [] };
    const snapshot = structuredClone(canvas);
    const result = applyOps(canvas, [
      { type: "node.add", node: node({ id: "a" }) },
      { type: "node.add", node: node({ id: "b" }) },
      { type: "node.add", node: node({ id: "a" }) },
      { type: "node.add", node: node({ id: "c" }) },
      { type: "node.update", id: "keep", patch: { data: { label: "Changed" } } },
      { type: "edge.add", edge: edge({ id: "e", source: "a", target: "b" }) },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.index, 2);
    assert.equal(result.error, "Node id is already used");
    assert.equal(result.canvas, undefined);
    assert.equal(result.ops, undefined);
    assert.deepEqual(canvas, snapshot);
  });

  it("rejects an unknown, non-object, or untyped op", () => {
    assert.equal(applyOps(blank(), [null]).error, "Change must be an object");
    assert.equal(applyOps(blank(), [{}]).error, "Unknown change type");
    assert.equal(applyOps(blank(), [{ type: 5 }]).error, "Unknown change type");
    const second = applyOps(blank(), [
      { type: "node.add", node: node({ id: "a" }) },
      { type: "node.drag" },
    ]);
    assert.equal(second.error, "Unknown change type");
    assert.equal(second.index, 1);
    assert.equal(second.canvas, undefined);
  });

  it("enforces the node and edge caps against the working canvas", () => {
    const almost = Array.from({ length: MAX_NODES - 1 }, (_, index) => node({ id: `n${index}` }));
    const filled = assertOk(applyOps({ nodes: almost, edges: [] }, [
      { type: "node.add", node: node({ id: "last" }) },
    ]));
    assert.equal(filled.canvas.nodes.length, MAX_NODES);
    const overflow = applyOps(filled.canvas, [
      { type: "node.add", node: node({ id: "overflow" }) },
    ]);
    assert.equal(overflow.ok, false);
    assert.match(overflow.error, /300/);

    const swapped = assertOk(applyOps(filled.canvas, [
      { type: "node.remove", id: "n0" },
      { type: "node.add", node: node({ id: "fresh" }) },
    ]));
    assert.equal(swapped.canvas.nodes.length, MAX_NODES);

    const endpoints = [node({ id: "a" }), node({ id: "b" })];
    const manyEdges = Array.from({ length: MAX_EDGES }, (_, index) => edge({
      id: `e${index}`,
      source: "a",
      target: "b",
    }));
    const edgeOverflow = applyOps({ nodes: endpoints, edges: manyEdges }, [
      { type: "edge.add", edge: edge({ id: "extra", source: "a", target: "b" }) },
    ]);
    assert.equal(edgeOverflow.ok, false);
    assert.match(edgeOverflow.error, /600/);
    const room = assertOk(applyOps({ nodes: endpoints, edges: manyEdges.slice(0, MAX_EDGES - 1) }, [
      { type: "edge.add", edge: edge({ id: "last", source: "a", target: "b" }) },
    ]));
    assert.equal(room.canvas.edges.length, MAX_EDGES);
  });

  it("returns whitelisted fresh ops and drops rogue fields", () => {
    const input = [
      {
        type: "node.add",
        extra: true,
        node: node({ id: "a", selected: true, data: { rogue: 1, color: "#abcdef" } }),
      },
      {
        type: "node.update",
        id: "a",
        extra: true,
        patch: { width: 80, selected: true, position: { x: 1, y: 2, z: 3 }, data: { label: "Z", rogue: 2 } },
      },
      {
        type: "edge.add",
        extra: true,
        edge: edge({ id: "e", source: "a", target: "a", markerEnd: "arrow", data: { label: "to", style: 1 } }),
      },
      {
        type: "edge.update",
        id: "e",
        extra: true,
        patch: { width: 4, data: { label: "from", rogue: 3 } },
      },
      { type: "edge.remove", id: "e", extra: true },
      { type: "node.remove", id: "a", extra: true },
    ];
    const result = assertOk(applyOps({ nodes: [], edges: [], version: 4, _id: "abc" }, input));
    assert.deepEqual(Object.keys(result.canvas).sort(), ["edges", "nodes"]);
    assert.deepEqual(Object.keys(result.ops[0]).sort(), ["node", "type"]);
    assert.deepEqual(Object.keys(result.ops[0].node).sort(), ["data", "height", "id", "position", "type", "width"]);
    assert.deepEqual(Object.keys(result.ops[0].node.data).sort(), ["color", "label", "shape", "textColor"]);
    assert.deepEqual(Object.keys(result.ops[0].node.position).sort(), ["x", "y"]);
    assert.equal(result.ops[0].node.data.color, "#ABCDEF");
    assert.equal(result.ops[0].node.selected, undefined);
    assert.deepEqual(result.ops[1].patch, { width: 80, position: { x: 1, y: 2 }, data: { label: "Z" } });
    assert.equal(result.ops[2].edge.markerEnd, undefined);
    assert.deepEqual(result.ops[2].edge.data, { label: "to" });
    assert.deepEqual(result.ops[3], { type: "edge.update", id: "e", patch: { data: { label: "from" } } });
    assert.deepEqual(result.ops[4], { type: "edge.remove", id: "e" });
    assert.deepEqual(result.ops[5], { type: "node.remove", id: "a" });
    assert.notEqual(result.ops[0], input[0]);
    assert.notEqual(result.ops[0].node, input[0].node);
    assert.notEqual(result.ops[0].node.data, input[0].node.data);
  });

  it("does not mutate a deep-frozen canvas or ops, and matches the unfrozen result", () => {
    const canvas = {
      nodes: [node({ id: "a", data: { label: "Stay" } })],
      edges: [],
      version: 7,
      _id: "project",
    };
    const ops = [
      { type: "node.add", node: node({ id: "b", selected: true }) },
      { type: "node.update", id: "a", patch: { data: { label: "Next" }, rogue: true } },
      { type: "edge.add", edge: edge({ id: "ab", source: "a", target: "b" }) },
    ];
    const unfrozen = applyOps(structuredClone(canvas), structuredClone(ops));
    deepFreeze(canvas);
    deepFreeze(ops);
    const frozen = applyOps(canvas, ops);
    assert.equal(frozen.ok, true);
    assert.deepEqual(frozen, unfrozen);
    assert.equal(canvas.nodes[0].data.label, "Stay");
    assert.equal(canvas.version, 7);
  });

  it("shares no reference with the input", () => {
    const canvas = {
      nodes: [node({ id: "a" })],
      edges: [edge({ id: "loop", source: "a", target: "a" })],
    };
    const ops = [{ type: "node.add", node: node({ id: "b" }) }];
    const canvasSnapshot = structuredClone(canvas);
    const opsSnapshot = structuredClone(ops);
    const result = assertOk(applyOps(canvas, ops));
    result.canvas.nodes[0].data.label = "changed";
    result.canvas.nodes[0].position.x = 999;
    result.canvas.edges[0].data.label = "changed";
    result.ops[0].node.data.label = "changed";
    result.ops[0].node.position.y = 999;
    assert.deepEqual(canvas, canvasSnapshot);
    assert.deepEqual(ops, opsSnapshot);
    assert.notEqual(result.canvas.nodes[0], canvas.nodes[0]);
    assert.notEqual(result.canvas.nodes[0].data, canvas.nodes[0].data);
    assert.notEqual(result.canvas.nodes[0].position, canvas.nodes[0].position);
    assert.notEqual(result.canvas.edges[0], canvas.edges[0]);
    assert.notEqual(result.canvas, canvas);
    assert.notEqual(result.canvas.nodes, canvas.nodes);
  });

  it("treats __proto__ and constructor as ordinary ids", () => {
    const result = assertOk(applyOps(blank(), [
      { type: "node.add", node: node({ id: "__proto__", data: { label: "P" } }) },
      { type: "node.add", node: node({ id: "constructor", data: { label: "C" } }) },
      { type: "edge.add", edge: edge({ id: "__proto__", source: "__proto__", target: "constructor" }) },
      { type: "edge.add", edge: edge({ id: "constructor", source: "constructor", target: "__proto__" }) },
      { type: "node.update", id: "__proto__", patch: { data: { label: "P2" } } },
    ]));
    assert.equal(result.canvas.nodes.find((item) => item.id === "__proto__").data.label, "P2");
    assert.equal(result.canvas.nodes.find((item) => item.id === "constructor").data.label, "C");
    assert.deepEqual(result.canvas.edges.map((item) => item.id), ["__proto__", "constructor"]);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(Object.hasOwn(Object.prototype, "label"), false);

    const removed = assertOk(applyOps(result.canvas, [{ type: "node.remove", id: "constructor" }]));
    assert.equal(removed.canvas.nodes.some((item) => item.id === "constructor"), false);
    assert.deepEqual(removed.canvas.edges, []);
    assert.equal(Object.prototype.polluted, undefined);
  });

  it("treats a non-object canvas and non-array collections as empty", () => {
    const op = [{ type: "node.add", node: node({ id: "a" }) }];
    assert.equal(assertOk(applyOps(null, op)).canvas.nodes.length, 1);
    assert.equal(assertOk(applyOps({ nodes: null, edges: "no" }, op)).canvas.nodes.length, 1);
  });
});

describe("normalizeCanvas", () => {
  it("returns an empty canvas for a non-object and ignores non-array fields", () => {
    for (const raw of [null, undefined, 5, "x", []]) {
      assert.deepEqual(normalizeCanvas(raw), { nodes: [], edges: [] });
    }
    assert.deepEqual(normalizeCanvas({ nodes: {}, edges: "no", version: 4 }), { nodes: [], edges: [] });
  });

  it("drops invalid nodes, keeps the first duplicate, and drops edges that no longer connect", () => {
    const result = normalizeCanvas({
      version: 9,
      nodes: [
        node({ id: "keep", data: { label: "First" }, selected: true }),
        node({ id: "keep", data: { label: "Second" } }),
        node({ id: "bad", data: { shape: "triangle" } }),
        5,
        null,
        node({ id: "ok" }),
      ],
      edges: [
        edge({ id: "good", source: "keep", target: "ok", markerEnd: "arrow", data: { label: "yes", style: 1 } }),
        edge({ id: "good", source: "ok", target: "keep", data: { label: "duplicate" } }),
        edge({ id: "dangling", source: "keep", target: "missing" }),
        edge({ id: "dropped", source: "bad", target: "ok" }),
        edge({ id: "broken", sourceHandle: "middle", source: "keep", target: "ok" }),
      ],
    });
    assert.deepEqual(result.nodes.map((item) => item.id), ["keep", "ok"]);
    assert.equal(result.nodes[0].data.label, "First");
    assert.equal(result.nodes[0].selected, undefined);
    assert.deepEqual(Object.keys(result.nodes[0]).sort(), ["data", "height", "id", "position", "type", "width"]);
    assert.deepEqual(result.edges.map((item) => item.id), ["good"]);
    assert.deepEqual(result.edges[0].data, { label: "yes" });
    assert.equal(result.edges[0].markerEnd, undefined);
    assert.equal(result.version, undefined);
    assert.deepEqual(Object.keys(result).sort(), ["edges", "nodes"]);
  });

  it("truncates long labels and stops at the node and edge caps", () => {
    const nodes = Array.from({ length: MAX_NODES + 1 }, (_, index) => node({
      id: `n${index}`,
      data: { label: index === 0 ? "a".repeat(NODE_LABEL_MAX + 1) : "x" },
    }));
    const edges = Array.from({ length: MAX_EDGES + 1 }, (_, index) => edge({
      id: `e${index}`,
      source: "n0",
      target: "n1",
      data: { label: "b".repeat(EDGE_LABEL_MAX + 1) },
    }));
    const result = normalizeCanvas({ nodes, edges, version: 2 });
    assert.equal(result.nodes.length, MAX_NODES);
    assert.equal(result.nodes[0].id, "n0");
    assert.equal(result.nodes[0].data.label.length, NODE_LABEL_MAX);
    assert.equal(result.nodes.some((item) => item.id === `n${MAX_NODES}`), false);
    assert.equal(result.edges.length, MAX_EDGES);
    assert.equal(result.edges[0].data.label.length, EDGE_LABEL_MAX);
    assert.equal(result.edges.at(-1).id, `e${MAX_EDGES - 1}`);
    assert.equal(result.version, undefined);
  });

  it("is idempotent and keeps __proto__ as a normal id", () => {
    const raw = {
      nodes: [node({ id: "__proto__", data: { label: `z${"a".repeat(NODE_LABEL_MAX)}`, color: "#abcdef" } })],
      edges: [edge({ id: "constructor", source: "__proto__", target: "__proto__", data: { label: "c".repeat(EDGE_LABEL_MAX + 5) } })],
    };
    const once = normalizeCanvas(raw);
    assert.deepEqual(normalizeCanvas(once), once);
    assert.equal(once.nodes[0].id, "__proto__");
    assert.equal(once.nodes[0].data.color, "#ABCDEF");
    assert.equal(once.edges[0].id, "constructor");
    assert.equal(Object.prototype.polluted, undefined);
  });
});

describe("module boundary", () => {
  it("has no import statement and no require call", () => {
    const source = fs.readFileSync(new URL("../src/shared/canvasOps.js", import.meta.url), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    assert.equal(/^\s*import\b/m.test(code), false);
    assert.equal(code.includes("require("), false);
  });
});

// Graph equality by id and fields. Array order and versions are not part of
// the round-trip contract.
function graphKey(canvas) {
  const nodes = canvas.nodes.map((n) => JSON.stringify(n)).sort();
  const edges = canvas.edges.map((e) => JSON.stringify(e)).sort();
  return { nodes, edges };
}

function applyChunked(canvas, ops) {
  let current = canvas;
  let commits = 0;
  for (let at = 0; at < ops.length; at += MAX_OPS_PER_COMMIT) {
    const chunk = ops.slice(at, at + MAX_OPS_PER_COMMIT);
    const result = applyOps(current, chunk);
    assert.equal(result.ok, true, result.ok ? "" : `${result.error} (chunk at ${at}, index ${result.index})`);
    current = result.canvas;
    commits += 1;
  }
  return { canvas: current, commits };
}

function roundTrip(before, ops) {
  const forward = assertOk(applyOps(before, ops));
  const inverse = assertOk(invertOps(before, ops));
  const back = applyChunked(forward.canvas, inverse.ops);
  assert.deepEqual(graphKey(back.canvas), graphKey(normalizeCanvas(before)));
  return { forward, inverse, back };
}

function seeded() {
  return {
    nodes: [node({ id: "a" }), node({ id: "b", position: { x: 10, y: 20 } }), node({ id: "c" })],
    edges: [
      edge({ id: "ab", source: "a", target: "b" }),
      edge({ id: "bc", source: "b", target: "c", data: { label: "calls" } }),
      edge({ id: "loop", source: "c", target: "c", sourceHandle: "top", targetHandle: "bottom" }),
    ],
  };
}

describe("invertOps", () => {
  it("inverts each op type", () => {
    const before = seeded();
    roundTrip(before, [{ type: "node.add", node: node({ id: "d" }) }]);
    roundTrip(before, [{ type: "node.remove", id: "b" }]);
    roundTrip(before, [{ type: "edge.remove", id: "ab" }]);
    roundTrip(before, [{ type: "edge.update", id: "bc", patch: { data: { label: "new" } } }]);
    roundTrip(before, [{ type: "edge.add", edge: edge({ id: "ac", source: "a", target: "c" }) }]);
    roundTrip(before, [{ type: "node.update", id: "a", patch: { position: { x: 5, y: 6 } } }]);
  });

  it("restores exactly the patched node fields, including nested data", () => {
    const before = seeded();
    const patches = [
      { position: { x: 1, y: 2 } },
      { width: 300 },
      { height: 90 },
      { data: { label: "x" } },
      { data: { shape: "circle" } },
      { data: { color: "#112233", textColor: "#445566" } },
      { position: { x: 3, y: 3 }, width: 100, height: 100, data: { label: "all", shape: "pill", color: "#000000", textColor: "#FFFFFF" } },
    ];
    for (const patch of patches) {
      const { inverse } = roundTrip(before, [{ type: "node.update", id: "b", patch }]);
      assert.equal(inverse.ops.length, 1);
      assert.deepEqual(Object.keys(inverse.ops[0].patch).sort(), Object.keys(patch).sort());
    }
    const data = roundTrip(before, [{ type: "node.update", id: "b", patch: { data: { label: "x" } } }]);
    assert.deepEqual(Object.keys(data.inverse.ops[0].patch.data), ["label"]);
  });

  it("restores a removed node before the edges its removal cascaded", () => {
    const before = seeded();
    const { inverse } = roundTrip(before, [{ type: "node.remove", id: "c" }]);
    assert.deepEqual(inverse.ops.map((op) => op.type), ["node.add", "edge.add", "edge.add"]);
    assert.equal(inverse.ops[0].node.id, "c");
  });

  it("restores a self-loop once", () => {
    const before = { nodes: [node({ id: "a" })], edges: [edge({ id: "s", source: "a", target: "a" })] };
    const { inverse } = roundTrip(before, [{ type: "node.remove", id: "a" }]);
    assert.equal(inverse.ops.filter((op) => op.type === "edge.add").length, 1);
  });

  it("handles two removed nodes that share an edge", () => {
    const before = {
      nodes: [node({ id: "a" }), node({ id: "b" })],
      edges: [edge({ id: "ab", source: "a", target: "b" })],
    };
    const ops = [{ type: "node.remove", id: "a" }, { type: "node.remove", id: "b" }];
    const { inverse } = roundTrip(before, ops);
    // The edge was cascaded by the first removal only, so it is restored once,
    // after both endpoints exist again.
    assert.equal(inverse.ops.filter((op) => op.type === "edge.add").length, 1);
    const edgeAt = inverse.ops.findIndex((op) => op.type === "edge.add");
    const adds = inverse.ops.map((op, index) => (op.type === "node.add" ? index : -1)).filter((i) => i >= 0);
    assert.ok(adds.every((index) => index < edgeAt));
  });

  it("handles repeated updates, add/update/remove and remove/re-add of one id", () => {
    const before = seeded();
    roundTrip(before, [
      { type: "node.update", id: "a", patch: { data: { label: "one" } } },
      { type: "node.update", id: "a", patch: { data: { label: "two" } } },
      { type: "node.update", id: "a", patch: { position: { x: 9, y: 9 } } },
    ]);
    roundTrip(before, [
      { type: "node.add", node: node({ id: "t", data: { label: "t" } }) },
      { type: "node.update", id: "t", patch: { width: 222 } },
      { type: "node.remove", id: "t" },
    ]);
    roundTrip(before, [
      { type: "node.remove", id: "b" },
      { type: "node.add", node: node({ id: "b", position: { x: 77, y: 77 }, data: { label: "again" } }) },
      { type: "edge.add", edge: edge({ id: "ab", source: "a", target: "b" }) },
    ]);
    roundTrip(before, [
      { type: "edge.update", id: "ab", patch: { data: { label: "x" } } },
      { type: "edge.update", id: "ab", patch: { data: { label: "y" } } },
      { type: "edge.remove", id: "ab" },
    ]);
    roundTrip(before, [
      { type: "edge.add", edge: edge({ id: "ac", source: "a", target: "c" }) },
      { type: "node.remove", id: "c" },
    ]);
  });

  it("works with special ids", () => {
    const before = {
      nodes: [node({ id: "__proto__" }), node({ id: "constructor" })],
      edges: [edge({ id: "toString", source: "__proto__", target: "constructor" })],
    };
    roundTrip(before, [{ type: "node.remove", id: "__proto__" }]);
    roundTrip(before, [{ type: "node.update", id: "constructor", patch: { data: { label: "k" } } }]);
    assert.equal(Object.prototype.polluted, undefined);
  });

  it("returns applyOps validation failures with the same index and no inverse", () => {
    const before = seeded();
    const bad = [
      { type: "node.update", id: "a", patch: { data: { label: "ok" } } },
      { type: "node.remove", id: "nope" },
    ];
    const forward = applyOps(before, bad);
    const inverse = invertOps(before, bad);
    assert.equal(inverse.ok, false);
    assert.equal(inverse.error, forward.error);
    assert.equal(inverse.index, forward.index);
    assert.equal("ops" in inverse, false);
    assert.equal(invertOps(before, []).ok, false);
    assert.equal(invertOps(before, "x").ok, false);
    assert.equal(invertOps(before, new Array(MAX_OPS_PER_COMMIT + 1).fill({ type: "node.remove", id: "a" })).ok, false);
  });

  it("uses normalized forward ops and drops display fields", () => {
    const before = seeded();
    const messy = node({ id: "d", data: { color: "#abcdef" } });
    messy.selected = true;
    const { inverse } = roundTrip(before, [{ type: "node.add", node: messy }]);
    assert.deepEqual(inverse.ops, [{ type: "node.remove", id: "d" }]);
    const display = { ...node({ id: "z" }), selected: true };
    const removeInverse = assertOk(invertOps({ nodes: [display], edges: [] }, [{ type: "node.remove", id: "z" }]));
    assert.equal("selected" in removeInverse.ops[0].node, false);
  });

  it("does not mutate input and returns detached objects", () => {
    const before = deepFreeze(seeded());
    const ops = deepFreeze([{ type: "node.remove", id: "b" }, { type: "edge.update", id: "loop", patch: { data: { label: "q" } } }]);
    const snapshot = JSON.stringify(before);
    const first = assertOk(invertOps(before, ops));
    assert.equal(JSON.stringify(before), snapshot);
    first.ops[1].node.data.label = "mutated";
    first.ops[1].node.position.x = 999;
    const second = assertOk(invertOps(before, ops));
    assert.notEqual(second.ops[1].node.data.label, "mutated");
    assert.notEqual(second.ops[1].node, before.nodes[1]);
    assert.notEqual(second.ops[1].node.position, before.nodes[1].position);
  });

  it("round-trips a no-op patch to an equivalent graph", () => {
    const before = seeded();
    roundTrip(before, [{ type: "node.update", id: "a", patch: { width: before.nodes[0].width } }]);
  });

  it("restores a node incident to 600 edges in 13 legal chunks", () => {
    const nodes = [node({ id: "hub" }), node({ id: "other" })];
    const edges = [];
    for (let index = 0; index < MAX_EDGES; index += 1) {
      const kind = index % 3;
      edges.push(edge({
        id: `x${index}`,
        source: kind === 1 ? "other" : "hub",
        target: kind === 0 ? "other" : "hub",
      }));
    }
    const before = { nodes, edges };
    const forward = assertOk(applyOps(before, [{ type: "node.remove", id: "hub" }]));
    assert.equal(forward.canvas.edges.length, 0);
    const inverse = assertOk(invertOps(before, [{ type: "node.remove", id: "hub" }]));
    assert.equal(inverse.ops.length, 1 + MAX_EDGES);
    const back = applyChunked(forward.canvas, inverse.ops);
    assert.equal(back.commits, 13);
    assert.deepEqual(graphKey(back.canvas), graphKey(before));
  });
});
