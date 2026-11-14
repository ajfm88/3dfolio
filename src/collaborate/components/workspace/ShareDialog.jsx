import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import Dialog from "../ui/Dialog";
import RoleBadge from "../ui/RoleBadge";
import { INVITE_EMAIL_MAX, MAX_PROJECT_SEATS } from "../../lib/projectLimits";
import { useSessionStore } from "../../store/useSessionStore";
import { useShareStore } from "../../store/useShareStore";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

const LABEL = "text-xs font-medium uppercase tracking-wider text-[var(--collab-muted)]";
const FIELD =
  "w-full rounded-xl border border-[var(--collab-border)] bg-[var(--collab-panel-2)] px-3 py-2 text-sm text-[var(--collab-text)] placeholder:text-[var(--collab-faint)] focus:border-[var(--collab-border-strong)] focus:outline-none";
const SECONDARY =
  "rounded-xl border border-[var(--collab-border)] px-4 py-2 text-sm font-semibold text-[var(--collab-text)] hover:bg-[var(--collab-panel-2)] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_var(--collab-accent-glow)] disabled:cursor-not-allowed disabled:opacity-50";
const Spinner = () => <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

export default function ShareDialog({ open, onClose, projectId }) {
  const id = useId();
  const detail = useShareStore((s) => s.detail);
  const viewerRole = useShareStore((s) => s.viewerRole);
  const status = useShareStore((s) => s.status);
  const busy = useShareStore((s) => s.busy);
  const reload = useShareStore((s) => s.reload);
  const invite = useShareStore((s) => s.invite);
  const revoke = useShareStore((s) => s.revokeInvite);
  const changeRole = useShareStore((s) => s.changeRole);
  const remove = useShareStore((s) => s.removeMember);
  const leave = useShareStore((s) => s.leave);
  const workspaceRole = useWorkspaceStore((s) => s.role);
  const self = useSessionStore((s) => s.authUser?._id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [confirm, setConfirm] = useState(null);
  const previousRole = useRef(workspaceRole);
  useEffect(() => {
    if (open && previousRole.current !== workspaceRole) reload();
    previousRole.current = workspaceRole;
  }, [open, workspaceRole, reload]);
  const owner = viewerRole === "owner";
  const members = detail?.members || [];
  const invites = detail?.invites || [];
  const used = members.length + invites.length;
  const disabled = Boolean(busy);

  const handleInvite = async (event) => {
    event.preventDefault();
    if (await invite(email, role)) setEmail("");
  };
  const handleRemove = async (userId) => {
    if (await remove(userId)) setConfirm(null);
  };
  const handleLeave = async () => {
    await leave();
  };

  const memberRow = (user, memberRole, isOwner = false) => {
    const userId = user?._id;
    const name = user?.fullName || "Former user";
    const mine = userId === self;
    return (
      <li key={userId || "owner"} className="flex flex-wrap items-center gap-2 py-2">
        {user?.img ? (
          <img src={user.img} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--collab-panel-2)]">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {name}
          {mine || (isOwner && owner) ? " (you)" : ""}
        </span>
        {owner && !isOwner ? (
          <>
            <label className="sr-only" htmlFor={`${id}-role-${userId}`}>
              Role for {name}
            </label>
            <select
              id={`${id}-role-${userId}`}
              className={FIELD + " w-auto"}
              value={memberRole}
              disabled={disabled}
              onChange={(e) => changeRole(userId, e.target.value)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            {confirm === userId ? (
              <span className="flex flex-wrap items-center gap-2">
                Remove {name}?{" "}
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={disabled}
                  onClick={() => handleRemove(userId)}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={disabled}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={SECONDARY}
                disabled={disabled}
                onClick={() => setConfirm(userId)}
              >
                Remove
              </button>
            )}
          </>
        ) : (
          <RoleBadge role={memberRole} />
        )}
      </li>
    );
  };
  return (
    <Dialog open={open} onClose={onClose} labelledBy={`${id}-title`} dismissible={!busy}>
      <h2 id={`${id}-title`} className="text-2xl font-bold">
        {owner ? "Share project" : "Project members"}
      </h2>
      <div className="mt-5 max-h-[60vh] overflow-y-auto">
        {status === "loading" && !detail ? (
          <div role="status">
            <Spinner />
            <span className="sr-only">Loading members</span>
          </div>
        ) : status === "error" ? (
          <div>
            <p>Couldn't load members.</p>
            <button type="button" className={SECONDARY} disabled={disabled} onClick={reload}>
              Retry
            </button>
          </div>
        ) : (
          detail && (
            <>
              {owner && (
                <>
                  <form
                    onSubmit={handleInvite}
                    className="space-y-3"
                  >
                    <label className={LABEL} htmlFor={`${id}-email`}>
                      Email
                    </label>
                    <input
                      id={`${id}-email`}
                      type="email"
                      autoFocus
                      data-autofocus
                      maxLength={INVITE_EMAIL_MAX}
                      className={FIELD}
                      value={email}
                      disabled={disabled}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <label className={LABEL} htmlFor={`${id}-invite-role`}>
                      Role
                    </label>
                    <select
                      id={`${id}-invite-role`}
                      className={FIELD}
                      value={role}
                      disabled={disabled}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      className={PRIMARY}
                      disabled={disabled || !email.trim() || used >= MAX_PROJECT_SEATS}
                    >
                      {busy === "invite" && <Spinner />}Invite
                    </button>
                    <p className="text-sm text-[var(--collab-muted)]">
                      Seats used: {used}/{MAX_PROJECT_SEATS}
                    </p>
                    {used >= MAX_PROJECT_SEATS && (
                      <p className="text-sm text-[var(--collab-muted)]">
                        Remove a member or revoke an invitation to invite someone else.
                      </p>
                    )}
                  </form>
                  <h3 className="mt-5 font-semibold">Pending invitations</h3>
                  {invites.length ? (
                    <ul>
                      {invites.map((item) => (
                        <li key={item._id} className="flex items-center gap-2 py-2">
                          <span title={item.email} className="min-w-0 flex-1 truncate">
                            {item.email}
                          </span>
                          <RoleBadge role={item.role} />
                          <button
                            type="button"
                            className={SECONDARY}
                            disabled={disabled}
                            onClick={() => revoke(item._id)}
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--collab-muted)]">No pending invitations</p>
                  )}
                </>
              )}
              <h3 className="mt-5 font-semibold">Members</h3>
              <ul>
                {memberRow(detail.owner, "owner", true)}
                {members.map((item) => memberRow(item.user, item.role))}
              </ul>
              {members.length === 0 && <p className="text-sm text-[var(--collab-muted)]">No members yet</p>}
              {!owner &&
                (confirm === "leave" ? (
                  <div className="mt-4">
                    Leave {detail.name}? You'll lose access until you're invited again.{" "}
                    <button
                      type="button"
                      className={SECONDARY}
                      disabled={disabled}
                      onClick={handleLeave}
                    >
                      Leave
                    </button>{" "}
                    <button
                      type="button"
                      className={SECONDARY}
                      disabled={disabled}
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`${SECONDARY} mt-4`}
                    disabled={disabled}
                    onClick={() => setConfirm("leave")}
                  >
                    Leave project
                  </button>
                ))}
            </>
          )
        )}
      </div>
      <button type="button" className={`${SECONDARY} mt-5`} disabled={disabled} onClick={onClose}>
        Close
      </button>
    </Dialog>
  );
}
