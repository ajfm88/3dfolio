import { useLayoutEffect, useRef } from "react";

import { NEAR_BOTTOM_PX } from "../lib/projectChat.js";

export { NEAR_BOTTOM_PX };

export function distanceFromBottom(metrics) {
  if (!metrics) return Number.POSITIVE_INFINITY;
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  if (![scrollTop, scrollHeight, clientHeight].every((value) => typeof value === "number")) {
    return Number.POSITIVE_INFINITY;
  }
  return scrollHeight - clientHeight - scrollTop;
}

// initial and the reader's own successful send go to the bottom. A live
// arrival follows only when the reader was already near the bottom. A prepend
// restores the anchored message instead of using the change in scrollHeight,
// so a concurrent append at the bottom cannot drag the viewport.
export function planScrollAction({ reason, distance, anchor }) {
  if (reason === "initial" || reason === "own-send") return { type: "bottom" };
  if (reason === "prepend" || reason === "hold") {
    return anchor ? { type: "anchor", anchor } : { type: "stay" };
  }
  if (reason === "live") {
    return typeof distance === "number" && distance <= NEAR_BOTTOM_PX ? { type: "bottom" } : { type: "stay" };
  }
  return { type: "stay" };
}

export function anchorFromBoxes(boxes, scrollTop) {
  if (!Array.isArray(boxes)) return null;
  const top = typeof scrollTop === "number" ? scrollTop : 0;
  for (const box of boxes) {
    if (!box || typeof box.id !== "string" || !box.id) continue;
    if (typeof box.offsetTop !== "number" || typeof box.offsetHeight !== "number") continue;
    if (box.offsetTop + box.offsetHeight > top) {
      return { id: box.id, offset: box.offsetTop - top };
    }
  }
  return null;
}

export function scrollTopForAnchor(box, anchor) {
  if (!box || !anchor || box.id !== anchor.id) return null;
  if (typeof box.offsetTop !== "number" || typeof anchor.offset !== "number") return null;
  return box.offsetTop - anchor.offset;
}

// A no-op when the viewport is already on the target. Resize observers use
// this so a correction cannot schedule another correction.
export function nextScrollTop(current, target) {
  if (typeof target !== "number" || !Number.isFinite(target)) return current;
  if (typeof current === "number" && Math.abs(current - target) < 1) return current;
  return target;
}

function boxesFrom(container) {
  if (!container || typeof container.querySelectorAll !== "function") return [];
  return [...container.querySelectorAll("[data-message-id]")].map((node) => ({
    id: node.getAttribute?.("data-message-id") ?? "",
    offsetTop: node.offsetTop,
    offsetHeight: node.offsetHeight,
  }));
}

export function captureAnchor(container) {
  if (!container) return null;
  return anchorFromBoxes(boxesFrom(container), container.scrollTop ?? 0);
}

// Load earlier and its Retry button both capture the visible row before the
// request. The hook keeps that anchor if the request fails.
export function requestEarlier(container, holdRef, run) {
  if (holdRef && container) holdRef.current = captureAnchor(container);
  return run();
}

function contentElement(container) {
  if (!container || typeof container.querySelector !== "function") return null;
  return container.querySelector("[data-project-chat-content]");
}

export function applyScrollPlan(container, plan) {
  if (!container || !plan || plan.type === "stay") return container?.scrollTop ?? 0;
  if (plan.type === "bottom") {
    const next = nextScrollTop(container.scrollTop, container.scrollHeight);
    container.scrollTop = next;
    return next;
  }
  if (plan.type === "anchor" && plan.anchor) {
    const box = boxesFrom(container).find((item) => item.id === plan.anchor.id);
    const target = scrollTopForAnchor(box, plan.anchor);
    if (target == null) return container.scrollTop;
    const next = nextScrollTop(container.scrollTop, target);
    container.scrollTop = next;
    return next;
  }
  return container.scrollTop ?? 0;
}

function readDistance(container) {
  if (!container) return Number.POSITIVE_INFINITY;
  return distanceFromBottom({
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  });
}

export function useProjectChatScroll({ messages, historyStatus, earlierStatus, ownSendTick, holdRef }) {
  const ref = useRef(null);
  const initialDone = useRef(false);
  const previousCount = useRef(0);
  const previousTick = useRef(ownSendTick);
  // Measured from scroll events, before React commits the next row. Reading
  // the element inside the layout effect would include the row that just arrived.
  const distanceRef = useRef(0);
  const anchorRef = useRef(null);
  const programmatic = useRef(false);

  function runScroll(container, plan) {
    programmatic.current = true;
    try {
      return applyScrollPlan(container, plan);
    } finally {
      programmatic.current = false;
    }
  }

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return undefined;
    const onScroll = () => {
      if (programmatic.current) return;
      distanceRef.current = readDistance(container);
      const next = captureAnchor(container);
      anchorRef.current = next;
      const held = holdRef?.current;
      if (!held) return;
      // The reader moved during a failed or pending earlier page. Retry
      // captures a new anchor. This hold must not pull them back.
      if (next && next.id === held.id && Math.abs(next.offset - held.offset) < 1) return;
      holdRef.current = null;
    };
    container.addEventListener?.("scroll", onScroll);
    return () => container.removeEventListener?.("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const holding = holdRef?.current;
    if (holding) {
      runScroll(container, planScrollAction({ reason: "hold", anchor: holding }));
      // An error must keep the anchor so Retry can restore it. Idle means the
      // prepend landed and the anchor has been applied.
      if (earlierStatus !== "loading" && earlierStatus !== "error") holdRef.current = null;
      previousCount.current = messages.length;
      distanceRef.current = readDistance(container);
      anchorRef.current = captureAnchor(container);
      return;
    }

    const tickChanged = previousTick.current !== ownSendTick;
    previousTick.current = ownSendTick;
    let reason = "stay";
    if (!initialDone.current && historyStatus === "ready") reason = "initial";
    else if (tickChanged) reason = "own-send";
    else if (messages.length > previousCount.current) reason = "live";

    if (reason === "initial") initialDone.current = true;
    runScroll(container, planScrollAction({
      reason,
      distance: distanceRef.current,
    }));
    previousCount.current = messages.length;
    distanceRef.current = readDistance(container);
    anchorRef.current = captureAnchor(container);
  }, [messages, historyStatus, earlierStatus, ownSendTick, holdRef]);

  useLayoutEffect(() => {
    const container = ref.current;
    const content = contentElement(container);
    if (!container || !content || typeof ResizeObserver !== "function") return undefined;
    let applying = false;
    const observer = new ResizeObserver(() => {
      if (applying) return;
      const holding = holdRef?.current;
      const follow = distanceRef.current <= NEAR_BOTTOM_PX;
      const saved = anchorRef.current;
      if (!holding && !follow && !saved) return;
      applying = true;
      programmatic.current = true;
      try {
        const plan = holding
          ? planScrollAction({ reason: "hold", anchor: holding })
          : follow
            ? planScrollAction({ reason: "live", distance: 0 })
            : planScrollAction({ reason: "hold", anchor: saved });
        applyScrollPlan(container, plan);
        anchorRef.current = captureAnchor(container);
        distanceRef.current = readDistance(container);
      } finally {
        programmatic.current = false;
        applying = false;
      }
    });
    // The scrollport's box stays the panel height. Images change the content
    // box, so that is the element this observer watches.
    observer.observe(content);
    return () => observer.disconnect();
  }, [holdRef]);

  return ref;
}
