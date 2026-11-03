import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import Dialog from "../ui/Dialog";
import { PROJECT_NAME_MAX, PROJECT_DESCRIPTION_MAX } from "../../lib/projectLimits";

const LABEL = "text-xs font-medium uppercase tracking-wider text-[var(--collab-muted)]";
const FIELD = "w-full rounded-xl border border-[var(--collab-border)] bg-[var(--collab-panel-2)] px-3 py-2 text-sm text-[var(--collab-text)] placeholder:text-[var(--collab-faint)] focus:border-[var(--collab-border-strong)] focus:outline-none";
const SECONDARY = "rounded-xl border border-[var(--collab-border)] px-4 py-2 text-sm font-semibold text-[var(--collab-text)] hover:bg-[var(--collab-panel-2)] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_var(--collab-accent-glow)] disabled:cursor-not-allowed disabled:opacity-50";

const ProjectFormDialog = ({ project, submitting, onSubmit, onClose }) => {
  const id = useId();
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const patch = {};
  if (project && trimmedName !== project.name.trim()) patch.name = trimmedName;
  if (project && trimmedDescription !== project.description.trim()) patch.description = trimmedDescription;
  const unchanged = Boolean(project) && (!trimmedName || Object.keys(patch).length === 0);

  return (
    <Dialog open onClose={onClose} labelledBy={`${id}-title`} dismissible={!submitting}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!submitting && !unchanged) onSubmit(project ? patch : { name: trimmedName, description: trimmedDescription });
      }}>
        <h2 id={`${id}-title`} className="text-2xl font-bold">{project ? "Edit project" : "New project"}</h2>
        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor={`${id}-name`} className={LABEL}>Name</label>
            <input id={`${id}-name`} autoFocus data-autofocus className={`${FIELD} mt-2`} maxLength={PROJECT_NAME_MAX} placeholder="Untitled project" value={name} disabled={submitting} onChange={(event) => setName(event.target.value)} aria-describedby={`${id}-name-count`} />
            <p id={`${id}-name-count`} className="mt-1 text-right text-xs text-[var(--collab-faint)]">{name.length}/{PROJECT_NAME_MAX}</p>
          </div>
          <div>
            <label htmlFor={`${id}-description`} className={LABEL}>Description</label>
            <textarea id={`${id}-description`} className={`${FIELD} mt-2`} maxLength={PROJECT_DESCRIPTION_MAX} rows={3} value={description} disabled={submitting} onChange={(event) => setDescription(event.target.value)} aria-describedby={`${id}-description-count`} />
            <p id={`${id}-description-count`} className="mt-1 text-right text-xs text-[var(--collab-faint)]">{description.length}/{PROJECT_DESCRIPTION_MAX}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className={SECONDARY}>Cancel</button>
          <button type="submit" disabled={submitting || unchanged} className={PRIMARY}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {project ? "Save changes" : "Create project"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export const CreateProjectDialog = ({ open, ...props }) => (
  open ? <ProjectFormDialog {...props} /> : null
);

export const EditProjectDialog = ({ open, ...props }) => (
  open ? <ProjectFormDialog {...props} /> : null
);

export const DeleteProjectDialog = ({ open, project, submitting, onSubmit, onClose }) => {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={id} dismissible={!submitting}>
      <h2 id={id} className="text-2xl font-bold">Delete project?</h2>
      <p className="mt-4 text-sm leading-relaxed text-[var(--collab-muted)]">
        <span className="font-semibold text-[var(--collab-text)]">{project?.name}</span> and its canvas will be permanently deleted for everyone who has access. This can't be undone.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" autoFocus data-autofocus onClick={onClose} disabled={submitting} className={SECONDARY}>Cancel</button>
        <button type="button" onClick={() => { if (!submitting) onSubmit(); }} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--collab-error)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Delete project
        </button>
      </div>
    </Dialog>
  );
};
