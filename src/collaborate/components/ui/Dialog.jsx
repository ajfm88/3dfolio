import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

// Mount a fresh focus scope on every open. Capture the opener during render,
// before React's autoFocus moves focus into the newly committed portal.
const OpenDialog = ({ onClose, labelledBy, dismissible, children }) => {
  const panel = useRef(null);
  const scrimStart = useRef(false);
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initial = panel.current.querySelector("[data-autofocus], [autofocus]")
      || panel.current.querySelector(FOCUSABLE);
    (initial || panel.current).focus();
    return () => {
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  useEffect(() => {
    // Disabling the focused input during submission sends focus to body.
    // Keep a focusable destination in the dialog while every control is locked.
    if (!dismissible) panel.current.focus();
  }, [dismissible]);

  useEffect(() => {
    const keepFocus = (event) => {
      if (panel.current && !panel.current.contains(event.target)) panel.current.focus();
    };
    document.addEventListener("focusin", keepFocus);
    return () => document.removeEventListener("focusin", keepFocus);
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (dismissible) onClose();
    }
    if (event.key !== "Tab") return;
    const controls = [...panel.current.querySelectorAll(FOCUSABLE)]
      .filter((element) => !element.matches(":disabled") && element.tabIndex >= 0);
    if (!controls.length) {
      event.preventDefault();
      panel.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  // A transformed ancestor becomes the containing block for position: fixed.
  // Portaling to body keeps the scrim anchored to the real viewport instead.
  return createPortal(
    <div
      className="collab-portal fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { scrimStart.current = event.target === event.currentTarget; }}
      onMouseUp={(event) => {
        const close = scrimStart.current && event.target === event.currentTarget;
        scrimStart.current = false;
        if (close && dismissible) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-3xl border border-[var(--collab-border)] bg-[var(--collab-elevated)] p-6 shadow-2xl shadow-black/40"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

const Dialog = ({ open, dismissible = true, ...props }) => (
  open ? <OpenDialog {...props} dismissible={dismissible} /> : null
);

export default Dialog;
