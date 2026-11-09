import { useEffect, useRef, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { useSessionStore } from "../../store/useSessionStore";
import { userColor } from "../../lib/userColor";
import { canonicalUserId, clientToOverlayPosition } from "../../lib/cursorPresence";

// The tip of the pointer is the SVG origin, so it sits exactly on the projected
// point regardless of the badge size. The badge is positioned off the tip.
const CURSOR_SVG = (
  <svg viewBox="0 0 14 20" width="14" height="20" aria-hidden="true" style={{ display: "block" }}>
    <path d="M0 0 L0 16 L4.5 12.2 L7.4 19 L10 17.9 L7.1 11.2 L12.6 11.2 Z" fill="currentColor" />
  </svg>
);

function truncate(str, max = 20) {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function displayName(fullName) {
  const trimmed = typeof fullName === "string" ? fullName.trim() : "";
  return trimmed || "Unknown user";
}

// Pure view: `project` maps a flow point to client coordinates (React Flow's
// flowToScreenPosition) and `rect` is the overlay's current bounding rect.
export function PresenceCursorsView({ cursors, participants, selfId, project, rect, containerRef }) {
  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 4 }}
      aria-hidden="true"
    >
      {Object.entries(cursors).map(([userId, cursor]) => {
        if (userId === selfId) return null;
        const participant = participants.find((p) => p.userId === userId);
        if (!participant) return null;
        const position = clientToOverlayPosition(project({ x: cursor.x, y: cursor.y }), rect);
        if (!position) return null;
        const color = userColor(userId);
        return (
          <div
            key={userId}
            className="pointer-events-none absolute select-none"
            style={{ left: 0, top: 0, transform: `translate(${position.x}px, ${position.y}px)`, color }}
          >
            <div style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>{CURSOR_SVG}</div>
            <span
              className="absolute whitespace-nowrap rounded-full text-sm font-medium"
              style={{
                left: 12,
                top: 16,
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "var(--collab-text)",
                background: "var(--collab-elevated)",
                padding: "1px 8px",
                border: `1px solid ${color}`,
              }}
            >
              {truncate(displayName(participant.fullName))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PresenceCursors() {
  const cursors = useWorkspaceStore((s) => s.cursors);
  const participants = useWorkspaceStore((s) => s.participants);
  const selfId = useSessionStore((s) => canonicalUserId(s.authUser?._id));
  const viewport = useViewport();
  const { flowToScreenPosition } = useReactFlow();
  const containerRef = useRef(null);
  const [, setMeasured] = useState(0);

  // The container stays mounted even with no cursors, so the observer attaches
  // on the first render and is never missed. A resize re-renders, and every
  // render reads the current rect so no stale offset is retained.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setMeasured((n) => n + 1));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // viewport is read so a pan or zoom reprojects without any network event.
  void viewport;
  const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };

  return (
    <PresenceCursorsView
      cursors={cursors}
      participants={participants}
      selfId={selfId}
      project={flowToScreenPosition}
      rect={rect}
      containerRef={containerRef}
    />
  );
}
