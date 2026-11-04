// Route root for collaborate: providers, session bootstrap, and the scoped
// theme. Everything imported here stays in the lazy /collaborate chunk, so its
// auth, realtime, and UI code does not enter the portfolio's initial bundle.
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../collaborate/collaborate.css";

import CollaborateAuthGate from "../collaborate/routes/CollaborateAuthGate";
import ProjectsPage from "../collaborate/routes/ProjectsPage";
import { useSessionStore } from "../collaborate/store/useSessionStore";

// React Flow is only needed inside a project. Loading the workspace on demand
// keeps that library out of the dashboard chunk.
const WorkspacePage = lazy(() => import("../collaborate/routes/WorkspacePage"));

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const CollaborateLoader = () => (
  <div className="flex min-h-[100dvh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--collab-border-strong)] border-t-[var(--collab-accent-2)]" />
  </div>
);

const SessionErrorCard = ({ checkAuth }) => (
  <div className="flex min-h-[100dvh] items-center justify-center p-4 sm:p-6">
    <div className="w-full max-w-md rounded-3xl border border-[var(--collab-border)] bg-[var(--collab-glass)] px-6 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur sm:px-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">Collaborate</p>
      <h1 className="mt-3 text-2xl font-bold">We couldn't verify your session</h1>
      <p className="mt-3 text-sm text-[var(--collab-muted)]">Check your connection and try again.</p>
      <button
        type="button"
        onClick={checkAuth}
        className="mt-8 w-full rounded-2xl bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_var(--collab-accent-glow)] transition-transform hover:-translate-y-0.5"
      >
        Try again
      </button>
    </div>
  </div>
);

const CollaborateApp = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const authUser = useSessionStore((s) => s.authUser);
  const isCheckingAuth = useSessionStore((s) => s.isCheckingAuth);
  const checkAuth = useSessionStore((s) => s.checkAuth);
  const clearAuth = useSessionStore((s) => s.clearAuth);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) checkAuth();
    else clearAuth();
  }, [isLoaded, isSignedIn, checkAuth, clearAuth]);

  // Reset on exit so re-entry starts with the loader instead of mounting pages
  // with the previous visit's session. This also closes any connecting socket.
  useEffect(() => () => useSessionStore.getState().resetSession(), []);

  return (
    <div className="collab-root min-h-[100dvh]">
      {!isLoaded ? (
        <CollaborateLoader />
      ) : !isSignedIn ? (
        <CollaborateAuthGate />
      ) : isCheckingAuth ? (
        <CollaborateLoader />
      ) : !authUser ? (
        <SessionErrorCard checkAuth={checkAuth} />
      ) : (
        <Suspense fallback={<CollaborateLoader />}>
          <Routes>
            <Route index element={<ProjectsPage />} />
            <Route path=":projectId" element={<WorkspacePage />} />
            <Route path="*" element={<Navigate to="/collaborate" replace />} />
          </Routes>
        </Suspense>
      )}
    </div>
  );
};

const Collaborate = () => (
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <CollaborateApp />
    <ToastContainer position="bottom-right" />
  </ClerkProvider>
);

export default Collaborate;
