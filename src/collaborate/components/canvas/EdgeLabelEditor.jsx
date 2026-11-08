import { useEffect, useLayoutEffect, useRef } from "react";

import { EDGE_LABEL_MAX } from "@shared/canvasOps.js";
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

// The label portal is not inside the edge wrapper, so closest() cannot find it.
function focusEdge(id) {
  if (typeof document === "undefined") return;
  const escaped = window.CSS?.escape ? window.CSS.escape(id) : id;
  const wrapper = document.querySelector(`.react-flow__edge[data-id="${escaped}"]`);
  if (wrapper && typeof wrapper.focus === "function") {
    wrapper.focus({ preventScroll: true });
  }
}

const EdgeLabelEditor = ({ id, initialLabel, onClose }) => {
  const setEdgeLabel = useWorkspaceStore((s) => s.setEdgeLabel);
  const fieldRef = useRef(null);
  const finished = useRef(false);

  // StrictMode replays this effect on the same ref. The setup clears the flag
  // the replay's cleanup just set, and a real removal sets it again so the
  // blur that follows a deleted field cannot save the draft.
  useLayoutEffect(() => {
    finished.current = false;
    return () => {
      finished.current = true;
    };
  }, []);

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
      setEdgeLabel(id, field ? field.value : initialLabel);
    }
    if (mode === "enter" || mode === "escape") {
      const field = fieldRef.current;
      const active = document.activeElement;
      if (!active || active === field || active === document.body) focusEdge(id);
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
      rows={2}
      className="collab-edge-editor nodrag nopan nowheel nokey box-border w-40 min-h-10 resize-none overflow-auto border-0 bg-transparent p-0 text-left text-xs text-inherit select-text outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--collab-accent)]"
      style={{ caretColor: "var(--collab-text)" }}
      defaultValue={initialLabel}
      maxLength={EDGE_LABEL_MAX}
      aria-label="Edge label"
      onKeyDown={onKeyDown}
      onKeyUp={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClickCapture={stop}
      onWheel={stop}
      onBlur={(event) => {
        const field = event.currentTarget;
        if (!field?.isConnected) return;
        finish("blur");
      }}
    />
  );
};

export default EdgeLabelEditor;
