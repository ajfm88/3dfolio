import { useEffect } from "react";

// Keyboard commands for the focused canvas. Everything here is plain DOM and
// plain functions so the production handler can be exercised without React.
// The listener is attached to the canvas surface element, not document or
// window: a native listener there never sees keys typed in a React portal,
// where logical bubbling would otherwise reach a React onKeyDown.

const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
].join(",");

// contenteditable="" and "true" both enable editing, and so does "plaintext-only".
// Inherited editing counts too, so the closest() search covers descendants.
export function isEditableElement(element) {
  if (!element || typeof element.closest !== "function") return false;
  if (element.isContentEditable === true) return true;
  return element.closest(EDITABLE_SELECTOR) !== null;
}

function pathOf(event) {
  if (typeof event.composedPath === "function") {
    const path = event.composedPath();
    if (Array.isArray(path) && path.length > 0) return path;
  }
  return event.target ? [event.target] : [];
}

// A key is not a canvas command if it came from, or lands in, a text field.
// The event path covers a target inside a shadow tree; the focused element
// covers a field that holds focus while the event is retargeted.
export function inEditableContext(event, doc) {
  for (const node of pathOf(event)) {
    if (isEditableElement(node)) return true;
  }
  const focused = doc?.activeElement ?? null;
  return isEditableElement(focused);
}

// Returns "undo", "redo", "zoomIn", "zoomOut" or null. Alt combinations,
// repeats, composition and an already-handled event are never commands.
export function classifyShortcut(event) {
  if (!event || event.defaultPrevented) return null;
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.repeat || event.altKey) return null;
  const key = typeof event.key === "string" ? event.key : "";
  const ctrl = Boolean(event.ctrlKey);
  const meta = Boolean(event.metaKey);
  const shift = Boolean(event.shiftKey);

  // Ctrl and Meta together are a different chord, not either one.
  if (ctrl && meta) return null;

  if (ctrl || meta) {
    const lower = key.toLowerCase();
    if (lower === "z") return shift ? "redo" : "undo";
    if (lower === "y" && ctrl && !shift) return "redo";
    // Ctrl/Cmd with +, - or = is the browser's own page zoom.
    return null;
  }

  if (key === "+" || key === "=") return "zoomIn";
  if (key === "-" && !shift) return "zoomOut";
  return null;
}

// Runs one key event against the canvas actions. A history command is consumed
// only if the action says it was accepted; an unavailable one does nothing, so
// the browser keeps whatever it would have done. Returns the command handled.
export function handleCanvasKey(event, { surface, doc, actions }) {
  const command = classifyShortcut(event);
  if (!command) return null;
  if (!surface || !event.target || !surface.contains(event.target)) return null;
  if (inEditableContext(event, doc)) return null;

  const accepted = actions[command]?.() === true;
  if (!accepted) return null;
  event.preventDefault();
  event.stopPropagation();
  return command;
}

// Wires the handler to the surface in the bubbling phase, so editors that stop
// their own keys have already had their say. Returns the exact cleanup.
export function attachCanvasShortcuts(surface, actions) {
  const doc = surface.ownerDocument;
  const listener = (event) => {
    handleCanvasKey(event, { surface, doc, actions });
  };
  surface.addEventListener("keydown", listener);
  return () => surface.removeEventListener("keydown", listener);
}

// A pane click may focus the canvas so the shortcuts have somewhere to land.
// It must not take focus away from a field, a toolbar button or the chat.
export function shouldFocusCanvas(event, doc) {
  const target = event?.target;
  if (!target || typeof target.closest !== "function") return false;
  if (!target.closest(".react-flow__pane")) return false;
  if (target.closest("button, a, [data-collab-chrome]")) return false;
  return !isEditableElement(doc?.activeElement ?? null);
}

// The one place a mounted canvas is wired to its keys. actionsRef is read at
// event time, so the listener is attached once per surface and never goes
// stale when the page re-renders. The cleanup removes that exact listener.
export function useCanvasShortcuts(surfaceRef, actionsRef) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    return attachCanvasShortcuts(surface, {
      undo: () => actionsRef.current.undo() === true,
      redo: () => actionsRef.current.redo() === true,
      zoomIn: () => actionsRef.current.zoomIn() === true,
      zoomOut: () => actionsRef.current.zoomOut() === true,
    });
  }, [surfaceRef, actionsRef]);
}

// Capture phase on purpose. The d3-drag behavior behind React Flow's node drag
// calls stopImmediatePropagation on the touchend and touchcancel of a touch it
// is tracking, so a bubbling listener on window never sees the very event that
// ends an aborted multitouch drag. Capture reaches window first. It only reads
// the event and never stops it, so React Flow's own handling is unchanged, and
// a release that still leaves a finger down is ignored.
const CAPTURE = true;

// Ends gesture tracking when the pointer sequence that started it is over, for
// interactions that never deliver their own end event. A touch release only
// counts once no finger remains down, so a second finger lifting does not end
// a drag that is still in progress. Touch pointerup is ignored because the
// matching touchend decides; mouse and pen release, pointer cancellation and
// losing window focus end it directly. The listeners exist only while a
// gesture is active.
export function attachGestureCancel(target, cancel) {
  const onTouchEnd = (event) => {
    const touches = event?.touches;
    if (touches && touches.length > 0) return;
    cancel();
  };
  const onPointerUp = (event) => {
    if (event?.pointerType === "touch") return;
    cancel();
  };
  const onAny = () => cancel();
  // Blur does not bubble, but a capture listener sees every element's blur.
  // Only the window itself losing focus ends a gesture.
  const onBlur = (event) => {
    if (event?.target && event.target !== target) return;
    cancel();
  };
  target.addEventListener("touchend", onTouchEnd, CAPTURE);
  target.addEventListener("touchcancel", onTouchEnd, CAPTURE);
  target.addEventListener("pointerup", onPointerUp, CAPTURE);
  target.addEventListener("mouseup", onAny, CAPTURE);
  target.addEventListener("pointercancel", onAny, CAPTURE);
  target.addEventListener("blur", onBlur, CAPTURE);
  return () => {
    target.removeEventListener("touchend", onTouchEnd, CAPTURE);
    target.removeEventListener("touchcancel", onTouchEnd, CAPTURE);
    target.removeEventListener("pointerup", onPointerUp, CAPTURE);
    target.removeEventListener("mouseup", onAny, CAPTURE);
    target.removeEventListener("pointercancel", onAny, CAPTURE);
    target.removeEventListener("blur", onBlur, CAPTURE);
  };
}

export function useGestureCancel(active, cancel) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    return attachGestureCancel(window, cancel);
  }, [active, cancel]);
}
