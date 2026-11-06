import { useEffect, useRef } from "react";

import { NODE_LABEL_MAX } from "@shared/canvasOps.js";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

// Enter unmounts the field and the browser then blurs it. Escape does the same.
// A state flag can still be false for that second event, so the ref is set
// before any dispatch or close. Composition Enter must not take this path.
function isComposing(event) {
  const native = event.nativeEvent;
  return native.isComposing || native.keyCode === 229;
}

function stop(event) {
  event.stopPropagation();
}

const NodeLabelEditor = ({ id, initialLabel, onClose }) => {
  const setNodeLabel = useWorkspaceStore((s) => s.setNodeLabel);
  const fieldRef = useRef(null);
  const finished = useRef(false);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.select();
  }, []);

  const finish = (mode) => {
    if (finished.current) return;
    finished.current = true;
    if (mode === "enter" || mode === "blur") {
      const field = fieldRef.current;
      setNodeLabel(id, field ? field.value : initialLabel);
    }
    if (mode === "enter" || mode === "escape") {
      const wrapper = fieldRef.current?.closest(".react-flow__node");
      if (wrapper instanceof HTMLElement) wrapper.focus({ preventScroll: true });
    }
    onClose();
  };

  const onKeyDown = (event) => {
    stop(event);
    if (isComposing(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish("enter");
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish("escape");
    }
  };

  return (
    <textarea
      ref={fieldRef}
      className="collab-label-editor nodrag nopan nowheel nokey block h-full min-h-0 w-full min-w-0 flex-1 self-stretch resize-none overflow-auto border-0 bg-transparent p-0 text-center text-inherit text-sm font-medium leading-snug outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--collab-accent)]"
      style={{ caretColor: "var(--collab-text)" }}
      defaultValue={initialLabel}
      maxLength={NODE_LABEL_MAX}
      aria-label="Node label"
      onKeyDown={onKeyDown}
      onKeyUp={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClickCapture={stop}
      onWheel={stop}
      onBlur={() => finish("blur")}
    />
  );
};

export default NodeLabelEditor;
