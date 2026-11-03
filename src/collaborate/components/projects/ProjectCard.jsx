import { Pencil, Trash2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "timeago.js";

const BADGES = {
  owner: "bg-[var(--collab-elevated)] text-[var(--collab-accent-2)] border border-[var(--collab-border-strong)]",
  editor: "text-[var(--collab-success)] border border-[var(--collab-border)]",
  viewer: "text-[var(--collab-muted)] border border-[var(--collab-border)]",
};

const ProjectCard = ({ project, onEdit, onDelete }) => (
  <article className="relative rounded-2xl border border-[var(--collab-border)] bg-[var(--collab-panel)] p-5 transition-colors hover:border-[var(--collab-border-strong)] hover:bg-[var(--collab-panel-2)]">
    <div className="flex items-start justify-between gap-2">
      <Link
        to={`/collaborate/${project._id}`}
        className="min-w-0 truncate text-base font-semibold text-[var(--collab-text)] after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--collab-accent-2)]"
      >
        {project.name}
      </Link>
      {project.role === "owner" && (
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Edit project" onClick={() => onEdit(project)} className="relative z-10 rounded-lg p-1.5 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)]">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Delete project" onClick={() => onDelete(project)} className="relative z-10 rounded-lg p-1.5 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-error)]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
    <p className={`mt-2 line-clamp-2 text-sm ${project.description ? "text-[var(--collab-muted)]" : "text-[var(--collab-faint)]"}`}>
      {project.description || "No description"}
    </p>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--collab-faint)]">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${BADGES[project.role] || BADGES.viewer}`}>{project.role}</span>
      <span className="inline-flex items-center gap-1" aria-label={`${project.memberCount} people have access`} title={`${project.memberCount} people have access`}>
        <Users className="h-4 w-4" />{project.memberCount}
      </span>
      <span>updated {format(project.updatedAt)}</span>
      {project.role !== "owner" && project.owner && <span>· by {project.owner.fullName}</span>}
    </div>
  </article>
);

export default ProjectCard;
