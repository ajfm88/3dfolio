import { Loader2 } from "lucide-react";
import RoleBadge from "../ui/RoleBadge";
import { useInvitationsStore } from "../../store/useInvitationsStore";

const PRIMARY =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center gap-2 rounded-xl border border-[var(--collab-border)] px-4 py-2 text-sm font-semibold text-[var(--collab-text)] disabled:opacity-50";
export default function InvitationsList() {
  const invites = useInvitationsStore((s) => s.invites);
  const busy = useInvitationsStore((s) => s.busy);
  const accept = useInvitationsStore((s) => s.accept);
  const decline = useInvitationsStore((s) => s.decline);
  if (!invites.length) return null;
  return (
    <section className="mt-10" aria-labelledby="invitations-title">
      <h2
        id="invitations-title"
        className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]"
      >
        Invitations <span className="text-[var(--collab-faint)]">· {invites.length}</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {invites.map((invite) => (
          <article
            key={invite._id}
            className="rounded-2xl border border-[var(--collab-border)] bg-[var(--collab-panel)] p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{invite.project.name}</h3>
                <p className="mt-1 text-sm text-[var(--collab-muted)]">
                  Invited by {invite.invitedBy?.fullName || "a former user"}
                </p>
              </div>
              <RoleBadge role={invite.role} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={PRIMARY}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => accept(invite)}
              >
                {busy === `accept:${invite._id}` && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Accept
              </button>
              <button
                className={SECONDARY}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => decline(invite)}
              >
                {busy === `decline:${invite._id}` && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Decline
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
