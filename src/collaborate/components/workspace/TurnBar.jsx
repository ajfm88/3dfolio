import { useEffect, useState } from "react";
import { Crown, Hand, X } from "lucide-react";

import { formatIdleCountdown, idleSecondsRemaining, sameTurnTab } from "../../lib/turnState";
import { userColor } from "../../lib/userColor";
import { useSessionStore } from "../../store/useSessionStore";
import {
  selectBindingTabId,
  selectIsHolder,
  useWorkspaceStore,
} from "../../store/useWorkspaceStore";

const buttonClass =
  "inline-flex items-center gap-1 rounded-full border border-[var(--collab-border-strong)] bg-[var(--collab-panel)] px-3 py-1 text-sm font-semibold text-[var(--collab-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--collab-accent)]";

function canonicalUserId(id) {
  return typeof id === "string" ? id.toLowerCase() : "";
}

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

// Participants win. A holder in grace can be missing from the roster, and
// then this tab's own session profile is the only name we have. An empty
// image must not become an <img> with an empty src.
function queueHeadName(queue, participants) {
  const head = queue?.[0];
  if (!head) return "Someone";
  const person = participants.find((item) => item.userId === head.userId);
  return trimmed(person?.fullName) || "Someone";
}

function holderProfile(holder, participants, authUser) {
  const person = participants.find((item) => item.userId === holder.userId);
  const self = canonicalUserId(authUser?._id) === holder.userId ? authUser : null;
  const name = trimmed(person?.fullName) || trimmed(self?.fullName) || "Unknown user";
  const img = trimmed(person?.img) || trimmed(self?.img);
  return { name, img };
}

function HolderAvatar({ userId, name, img }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = img !== "" && failedUrl !== img;

  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[var(--collab-panel)] text-[11px] font-semibold text-[var(--collab-text)]"
      style={{ borderColor: userColor(userId) }}
    >
      {showImage ? (
        <img src={img} alt="" className="h-full w-full object-cover" onError={() => setFailedUrl(img)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

const TurnBar = () => {
  const turn = useWorkspaceStore((state) => state.turn);
  const turnReceivedAt = useWorkspaceStore((state) => state.turnReceivedAt);
  const role = useWorkspaceStore((state) => state.role);
  const participants = useWorkspaceStore((state) => state.participants);
  const isHolder = useWorkspaceStore(selectIsHolder);
  const tabId = useWorkspaceStore(selectBindingTabId);
  const requestTurn = useWorkspaceStore((state) => state.requestTurn);
  const releaseTurn = useWorkspaceStore((state) => state.releaseTurn);
  const cancelTurnRequest = useWorkspaceStore((state) => state.cancelTurnRequest);
  const reclaimTurn = useWorkspaceStore((state) => state.reclaimTurn);
  const authUser = useSessionStore((state) => state.authUser);

  const self = { userId: canonicalUserId(authUser?._id), tabId };
  const eligible = role === "owner" || role === "editor";
  const queuedIndex = turn?.queue.findIndex((entry) => sameTurnTab(entry, self)) ?? -1;
  const queued = queuedIndex >= 0;
  const profile = turn?.holder ? holderProfile(turn.holder, participants, authUser) : null;
  const selfUser = Boolean(profile) && profile && canonicalUserId(authUser?._id) === turn.holder.userId;

  let holderText = "";
  if (turn?.holder) {
    if (isHolder) holderText = "You're editing";
    else if (selfUser && tabId && turn.holder.tabId !== tabId) holderText = "Your other tab is editing";
    else holderText = `${profile.name} is editing`;
    if (turn.graceUntil !== null) holderText = `${holderText} · Reconnecting`;
  }

  let primary = "Loading turn…";
  if (turn) {
    if (role === "viewer") primary = holderText ? `View only. ${holderText}` : "View only";
    else if (isHolder) primary = holderText;
    else if (!turn.holder) primary = "Nobody is editing";
    else primary = holderText;
  }

  const waiting = turn && turn.queue.length > 0
    ? `${turn.queue.length} waiting`
    : "";
  const position = queued ? `Your position: ${queuedIndex + 1}` : "";

  const countdownVisible = Boolean(
    isHolder
    && turn
    && turn.queue.length > 0
    && turn.idleDeadline != null
    && turn.graceUntil == null
    && typeof turnReceivedAt === "number"
  );
  const headKey = turn?.queue[0] ? `${turn.queue[0].userId}:${turn.queue[0].tabId}` : "";
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!countdownVisible) return undefined;
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [countdownVisible, turnReceivedAt, turn?.serverNow, turn?.idleDeadline, headKey]);
  const seconds = countdownVisible ? idleSecondsRemaining(turn, turnReceivedAt, performance.now()) : null;
  const countdown = seconds == null
    ? null
    : `${queueHeadName(turn.queue, participants)} is waiting — passes in ${formatIdleCountdown(seconds)} unless you edit`;

  const showRequest = Boolean(turn) && eligible && !isHolder && !queued;
  const showCancel = Boolean(turn) && eligible && !isHolder && queued;
  const showRelease = Boolean(turn) && isHolder;
  const showTake = Boolean(turn) && role === "owner" && Boolean(turn.holder) && !isHolder;

  return (
    <div
      data-collab-chrome
      className="absolute left-1/2 top-4 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full border border-[var(--collab-border)] bg-[var(--collab-glass)] px-3 py-2 text-sm text-[var(--collab-text)] shadow-2xl shadow-black/40 backdrop-blur"
    >
      {profile ? <HolderAvatar userId={turn.holder.userId} name={profile.name} img={profile.img} /> : null}
      <p aria-live="polite" className="min-w-0 text-center text-sm text-[var(--collab-text)]">
        <span className={isHolder ? "text-[var(--collab-success)]" : undefined}>{primary}</span>
        {waiting ? <span className="text-[var(--collab-warning)]">{` ${waiting}`}</span> : null}
        {position ? <span>{` ${position}`}</span> : null}
      </p>
      {countdown ? <p className="text-[var(--collab-warning)]">{countdown}</p> : null}
      {showRequest ? (
        <button type="button" className={buttonClass} onClick={() => requestTurn()}>
          <Hand className="h-4 w-4" aria-hidden="true" />
          Request turn
        </button>
      ) : null}
      {showCancel ? (
        <button type="button" className={buttonClass} onClick={() => cancelTurnRequest()}>
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel request
        </button>
      ) : null}
      {showRelease ? (
        <button type="button" className={buttonClass} onClick={() => releaseTurn()}>
          Release
        </button>
      ) : null}
      {showTake ? (
        <button type="button" className={buttonClass} onClick={() => reclaimTurn()}>
          <Crown className="h-4 w-4" aria-hidden="true" />
          Take control
        </button>
      ) : null}
    </div>
  );
};

export default TurnBar;
