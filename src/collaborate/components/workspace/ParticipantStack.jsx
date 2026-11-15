import { useState } from "react";

import { useSessionStore } from "../../store/useSessionStore";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { userColor } from "../../lib/userColor";

const VISIBLE_OTHERS = 5;
const SMALL_VISIBLE = 2;

function canonicalUserId(id) {
  return typeof id === "string" ? id.toLowerCase() : "";
}

function displayName(fullName) {
  const trimmed = fullName.trim();
  return trimmed ? trimmed : "Unknown user";
}

function initials(fullName) {
  const trimmed = fullName.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/);
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function personLabel(participant) {
  return `${displayName(participant.fullName)} — ${participant.role}`;
}

function ParticipantAvatar({ participant, narrowHidden = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const name = displayName(participant.fullName);
  const label = personLabel(participant);
  const showImage = participant.img !== "" && failedUrl !== participant.img;
  const color = userColor(participant.userId);

  return (
    <span
      role="img"
      tabIndex={0}
      title={label}
      aria-label={label}
      className={`relative -ml-2 ${narrowHidden ? "hidden sm:flex" : "flex"} h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[var(--collab-panel)] text-[11px] font-semibold text-[var(--collab-text)] first:ml-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--collab-accent)]`}
      style={{ borderColor: color }}
    >
      {showImage ? (
        <img
          src={participant.img}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(participant.img)}
        />
      ) : (
        initials(participant.fullName)
      )}
    </span>
  );
}

const ParticipantStack = () => {
  const participants = useWorkspaceStore((s) => s.participants);
  const selfId = canonicalUserId(useSessionStore((s) => s.authUser?._id));
  if (!selfId) return null;

  const others = participants.filter((person) => person.userId !== selfId);
  if (others.length === 0) return null;

  const visible = others.slice(0, VISIBLE_OTHERS);
  const hidden = others.slice(VISIBLE_OTHERS);
  const hiddenLabel = hidden.map(personLabel).join(", ");

  return (
    <div role="group" className="flex shrink-0 items-center" aria-label="People in this project">
      {visible.map((person, index) => (
        <ParticipantAvatar key={person.userId} participant={person} narrowHidden={index >= SMALL_VISIBLE} />
      ))}
      {hidden.length > 0 ? (
        <span
          role="img"
          tabIndex={0}
          title={hiddenLabel}
          aria-label={hiddenLabel}
          className="relative -ml-2 hidden h-7 shrink-0 items-center rounded-full border border-[var(--collab-border-strong)] bg-[var(--collab-panel)] px-2 text-[11px] font-semibold text-[var(--collab-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--collab-accent)] sm:inline-flex"
        >
          +{hidden.length}
        </span>
      ) : null}
      {others.length > SMALL_VISIBLE ? (
        <span
          role="img"
          tabIndex={0}
          title={others.length - SMALL_VISIBLE === 1 ? "1 more person" : `${others.length - SMALL_VISIBLE} more people`}
          aria-label={others.length - SMALL_VISIBLE === 1 ? "1 more person" : `${others.length - SMALL_VISIBLE} more people`}
          className="relative -ml-2 inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--collab-border-strong)] bg-[var(--collab-panel)] px-2 text-[11px] font-semibold text-[var(--collab-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--collab-accent)] sm:hidden"
        >
          +{others.length - SMALL_VISIBLE}
        </span>
      ) : null}
    </div>
  );
};

export default ParticipantStack;
