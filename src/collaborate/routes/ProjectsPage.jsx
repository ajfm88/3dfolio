import { useEffect, useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import { FolderPlus, Plus, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { LOGO_SRC, LOGO_ALT } from "../../constants/brand";
import { MAX_OWNED_PROJECTS } from "../lib/projectLimits";
import { useProjectsStore } from "../store/useProjectsStore";
import ProjectCard from "../components/projects/ProjectCard";
import { CreateProjectDialog, EditProjectDialog, DeleteProjectDialog } from "../components/projects/ProjectDialogs";

const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-4 py-2 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_var(--collab-accent-glow)] disabled:cursor-not-allowed disabled:opacity-50";

const EmptyState = ({ icon: Icon, children, action }) => (
  <div className="rounded-2xl border border-dashed border-[var(--collab-border)] bg-[var(--collab-panel)] p-8 text-center">
    <Icon className="mx-auto h-8 w-8 text-[var(--collab-faint)]" />
    <p className="mt-3 text-sm text-[var(--collab-muted)]">{children}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

const ProjectsPage = () => {
  const owned = useProjectsStore((s) => s.owned);
  const shared = useProjectsStore((s) => s.shared);
  const isLoading = useProjectsStore((s) => s.isLoading);
  const hasLoaded = useProjectsStore((s) => s.hasLoaded);
  const loadError = useProjectsStore((s) => s.loadError);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const createProject = useProjectsStore((s) => s.createProject);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const [dialog, setDialog] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [failedProject, setFailedProject] = useState(null);
  const [hasRequested, setHasRequested] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
    setHasRequested(true);
  }, [loadProjects]);

  // loadProjects resets the persistent store in an effect. Until that effect
  // runs, a fresh page must not render lists left over from a previous visit.
  const showLists = hasRequested && hasLoaded;
  const atCap = showLists && owned.length >= MAX_OWNED_PROJECTS;

  // A failed edit/delete refresh can remove a stale card. Observe the refreshed
  // selector values, rather than the handler's pre-request list snapshot.
  useEffect(() => {
    if (!failedProject) return;
    if (![...owned, ...shared].some((project) => project._id === failedProject)) setDialog(null);
    setFailedProject(null);
  }, [failedProject, owned, shared]);

  const closeDialog = () => { if (!submitting) setDialog(null); };
  const submit = async (input) => {
    if (submitting || !dialog) return;
    setSubmitting(true);
    try {
      if (dialog.kind === "create") {
        const project = await createProject(input);
        if (project) {
          setDialog(null);
          navigate(`/collaborate/${project._id}`);
        }
      } else {
        const ok = dialog.kind === "edit"
          ? await updateProject(dialog.project._id, input)
          : await deleteProject(dialog.project._id);
        if (ok) {
          setDialog(null);
          toast.success(dialog.kind === "edit" ? "Project updated" : "Project deleted");
        } else {
          setFailedProject(dialog.project._id);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const newProjectButton = (
    <button type="button" disabled={atCap} onClick={() => setDialog({ kind: "create" })} className={PRIMARY}>
      <Plus className="h-5 w-5" />New project
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <img src={LOGO_SRC} alt={LOGO_ALT} className="h-8 w-8 object-contain" />
            <h1 className="text-2xl font-bold">ajfm88 Collaborate</h1>
          </div>
          <Link to="/" className="mt-2 inline-block text-xs text-[var(--collab-muted)] hover:text-[var(--collab-accent-2)]">← Back to portfolio</Link>
        </div>
        <div className="flex items-center gap-4">{newProjectButton}<UserButton /></div>
      </header>
      {atCap && <p className="mt-3 text-xs text-[var(--collab-warning)]">You own {owned.length} of {MAX_OWNED_PROJECTS} projects. Delete one to create another.</p>}

      {!hasRequested || (!hasLoaded && (isLoading || !loadError)) ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--collab-border-strong)] border-t-[var(--collab-accent-2)]" />
        </div>
      ) : !hasLoaded && loadError ? (
        <div className="mt-10 rounded-2xl border border-[var(--collab-border)] bg-[var(--collab-panel)] p-8 text-center">
          <p className="text-sm text-[var(--collab-muted)]">Couldn't load your projects.</p>
          <button type="button" onClick={loadProjects} className="mt-4 rounded-xl border border-[var(--collab-border)] px-4 py-2 text-sm font-semibold text-[var(--collab-text)] hover:bg-[var(--collab-panel-2)]">Try again</button>
        </div>
      ) : (
        <>
          <section className="mt-10" aria-labelledby="owned-projects-title">
            <h2 id="owned-projects-title" className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">My projects <span className="text-[var(--collab-faint)]">· {owned.length}</span></h2>
            {owned.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {owned.map((project) => <ProjectCard key={project._id} project={project} onEdit={(value) => setDialog({ kind: "edit", project: value })} onDelete={(value) => setDialog({ kind: "delete", project: value })} />)}
              </div>
            ) : <EmptyState icon={FolderPlus} action={newProjectButton}>You don't have any projects yet.</EmptyState>}
          </section>
          <section className="mt-10" aria-labelledby="shared-projects-title">
            <h2 id="shared-projects-title" className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">Shared with me <span className="text-[var(--collab-faint)]">· {shared.length}</span></h2>
            {shared.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shared.map((project) => <ProjectCard key={project._id} project={project} />)}
              </div>
            ) : <EmptyState icon={Users}>Nothing shared with you yet. Projects you're invited to appear here.</EmptyState>}
          </section>
        </>
      )}

      {dialog?.kind === "create" && <CreateProjectDialog open submitting={submitting} onSubmit={submit} onClose={closeDialog} />}
      {dialog?.kind === "edit" && <EditProjectDialog open project={dialog.project} submitting={submitting} onSubmit={submit} onClose={closeDialog} />}
      {dialog?.kind === "delete" && <DeleteProjectDialog open project={dialog.project} submitting={submitting} onSubmit={submit} onClose={closeDialog} />}
    </div>
  );
};

export default ProjectsPage;
