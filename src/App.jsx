import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import {
  About,
  Contact,
  ErrorBoundary,
  Experience,
  Hero,
  Navbar,
  Tech,
  Works,
  StarsCanvas,
} from "./components";

const GithubFollowerTracker = lazy(() => import("./pages/GithubFollowerTracker"));
const Admin = lazy(() => import("./pages/Admin"));
const Blog = lazy(() => import("./pages/Blog"));
const Chat = lazy(() => import("./pages/Chat"));

// The boundary sits outside Suspense rather than inside it, so it also catches a
// route that fails before it ever renders: a chunk that 404s after a redeploy,
// or a module that throws while evaluating — which is how a missing environment
// variable surfaces — rejects the dynamic import, and React re-throws it here.
// The key is insurance: a tripped boundary keeps rendering its fallback until it
// unmounts, and two lazy routes would otherwise reconcile into one instance.
const LazyRoute = ({ feature, children }) => (
  <ErrorBoundary key={feature} feature={feature}>
    <Suspense fallback={null}>{children}</Suspense>
  </ErrorBoundary>
);

const Portfolio = () => (
  <div className="relative z-0 bg-primary">
    <StarsCanvas />
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, rgba(88, 28, 135, 0.15) 0%, transparent 70%)",
        zIndex: 0,
      }}
    />
    <div className="bg-hero-pattern bg-cover bg-no-repeat bg-center">
      <Navbar />
      <Hero />
    </div>
    <About />
    <Experience />
    <Tech />
    <Works />
    <div className="relative z-0">
      <Contact />
    </div>
  </div>
);

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* No feature name on the portfolio itself: its fallback has nowhere to
            send anyone but back to the page that just failed. */}
        <Route
          path="/"
          element={
            <ErrorBoundary>
              <Portfolio />
            </ErrorBoundary>
          }
        />
        <Route
          path="/gft"
          element={
            <LazyRoute feature="The follower tracker">
              <GithubFollowerTracker />
            </LazyRoute>
          }
        />
        <Route
          path="/ajfoucault/*"
          element={
            <LazyRoute feature="The admin panel">
              <Admin />
            </LazyRoute>
          }
        />
        <Route
          path="/blog/*"
          element={
            <LazyRoute feature="The blog">
              <Blog />
            </LazyRoute>
          }
        />
        <Route
          path="/chat/*"
          element={
            <LazyRoute feature="Chat">
              <Chat />
            </LazyRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
