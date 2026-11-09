import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "vite";

const PROJECT = "64b0000000000000000000aa";

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function settle() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe("canvasPreview", () => {
  let vite;
  let throttleModule;
  let canvasPreviewModule;
  let canvasOpsModule;

  before(async () => {
    vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
    });
    throttleModule = await vite.ssrLoadModule("/src/collaborate/lib/throttle.js");
    canvasPreviewModule = await vite.ssrLoadModule("/src/collaborate/lib/canvasPreview.js");
    canvasOpsModule = await vite.ssrLoadModule("/server/src/shared/canvasOps.js");
  });

  after(async () => {
    await vite?.close();
  });

  const { throttle } = throttleModule;
  const { createPreviewOverlayController } = canvasPreviewModule;
  const { ID_PATTERN, POSITION_MAX, NODE_SIZE_MIN, NODE_SIZE_MAX } = canvasOpsModule;

  describe("throttle", () => {
    it("first call runs immediately", () => {
      const clock = { now: () => 1000, setTimeout: (fn) => fn(), clearTimeout: () => {} };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      assert.equal(calls, 1);
    });

    it("calls inside window collapse to newest args", () => {
      let now = 1000;
      const clock = {
        now: () => now,
        setTimeout: (fn, delay) => { setTimeout(() => { now += delay; fn(); }, 0); },
        clearTimeout: () => {},
      };
      let lastArgs = null;
      const fn = throttle((...args) => { lastArgs = args; }, 50, clock);
      fn("first");
      fn("second");
      fn("third");
      return settle().then(() => {
        assert.deepEqual(lastArgs, ["third"]);
      });
    });

    it("trailing call runs once after window", () => {
      let now = 1000;
      let timerFn = null;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      assert.equal(calls, 1);
      now = 1025;
      fn("b");
      assert.equal(calls, 1);
      timerFn();
      assert.equal(calls, 2);
    });

    it("cancel prevents trailing call", () => {
      let now = 1000;
      let timerFn = null;
      const clock = {
        now: () => now,
        setTimeout: (fn) => { timerFn = fn; },
        clearTimeout: () => { timerFn = null; },
      };
      let calls = 0;
      const fn = throttle(() => { calls += 1; }, 50, clock);
      fn("a");
      fn.cancel();
      now = 1025;
      if (timerFn) timerFn();
      assert.equal(calls, 1);
    });
  });

  describe("canvasPreview sanitize", () => {
    const controller = createPreviewOverlayController();

    it("accepts valid position-only nodes", () => {
      const nodes = [{ id: "n1", position: { x: 10, y: 20 } }];
      const result = controller.receivePreview({ nodes }, () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]);
      assert.equal(result.ok, true);
      assert.deepEqual(result.applied, ["n1"]);
    });

    it("accepts valid position+size nodes", () => {
      const nodes = [{ id: "n1", position: { x: 10, y: 20 }, width: 160, height: 80 }];
      const result = controller.receivePreview({ nodes }, () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]);
      assert.equal(result.ok, true);
    });

    it("rejects empty array", () => {
      const result = controller.receivePreview({ nodes: [] }, () => []);
      assert.equal(result.ok, true);
      assert.equal(result.applied.length, 0);
    });

    it("rejects over 50 nodes", () => {
      const nodes = Array.from({ length: 51 }, (_, i) => ({ id: `n${i}`, position: { x: i, y: i } }));
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects duplicate ids", () => {
      const nodes = [{ id: "n1", position: { x: 0, y: 0 } }, { id: "n1", position: { x: 10, y: 10 } }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects non-finite position", () => {
      const nodes = [{ id: "n1", position: { x: NaN, y: 0 } }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects position out of bounds", () => {
      const nodes = [{ id: "n1", position: { x: POSITION_MAX + 1, y: 0 } }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects width without height", () => {
      const nodes = [{ id: "n1", position: { x: 0, y: 0 }, width: 100 }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("rejects size out of bounds", () => {
      const nodes = [{ id: "n1", position: { x: 0, y: 0 }, width: NODE_SIZE_MIN - 1, height: 80 }];
      const result = controller.receivePreview({ nodes }, () => []);
      assert.equal(result.ok, false);
    });

    it("skips unknown ids", () => {
      const nodes = [{ id: "n1", position: { x: 10, y: 20 } }, { id: "unknown", position: { x: 0, y: 0 } }];
      const result = controller.receivePreview({ nodes }, () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]);
      assert.equal(result.ok, true);
      assert.deepEqual(result.applied, ["n1"]);
    });
  });

  describe("canvasPreview overlay lifecycle", () => {
    it("applies overlay to display nodes", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const rfNodes = controller.applyOverlays([
        { id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: {} }
      ]);
      assert.equal(rfNodes[0].position.x, 50);
      assert.equal(rfNodes[0].position.y, 60);
    });

    it("applies size overlay with measured", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 }, width: 200, height: 150 }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const rfNodes = controller.applyOverlays([
        { id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: {} }
      ]);
      assert.equal(rfNodes[0].position.x, 50);
      assert.equal(rfNodes[0].width, 200);
      assert.equal(rfNodes[0].height, 150);
      assert.deepEqual(rfNodes[0].measured, { width: 200, height: 150 });
    });

    it("clears overlay on canonical position change", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }];
      const current = [{ id: "n1", position: { x: 100, y: 100 }, width: 100, height: 100 }];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), false);
    });

    it("clears overlay on canonical size change", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 }, width: 200, height: 150 }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }];
      const current = [{ id: "n1", position: { x: 0, y: 0 }, width: 150, height: 120 }];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), false);
    });

    it("keeps overlay on label-only change", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: "old" } }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: "old" } }];
      const current = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: "new" } }];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), true);
    });

    it("clears overlay on node removal", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      const previous = [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }];
      const current = [];
      controller.onCanonicalNodesChange(previous, current);
      const overlays = controller.getOverlays();
      assert.equal(overlays.has("n1"), false);
    });

    it("clearAllOverlays removes everything", () => {
      const controller = createPreviewOverlayController();
      controller.receivePreview(
        { nodes: [{ id: "n1", position: { x: 50, y: 60 } }] },
        () => [{ id: "n1", position: { x: 0, y: 0 }, width: 100, height: 100 }]
      );
      controller.clearAllOverlays();
      const overlays = controller.getOverlays();
      assert.equal(overlays.size, 0);
    });
  });
});