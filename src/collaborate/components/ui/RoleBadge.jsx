const BADGES = {
  owner: "bg-[var(--collab-elevated)] text-[var(--collab-accent-2)] border border-[var(--collab-border-strong)]",
  editor: "text-[var(--collab-success)] border border-[var(--collab-border)]",
  viewer: "text-[var(--collab-muted)] border border-[var(--collab-border)]",
};

const RoleBadge = ({ role }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${BADGES[role] || BADGES.viewer}`}>{role}</span>
);

export default RoleBadge;
