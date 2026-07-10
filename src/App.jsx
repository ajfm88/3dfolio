import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import {
  About,
  Contact,
  Experience,
  Hero,
  Navbar,
  Tech,
  Works,
  StarsCanvas,
} from "./components";

const GithubFollowerTracker = lazy(() => import("./pages/GithubFollowerTracker"));
const Admin = lazy(() => import("./pages/Admin"));

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
        <Route path="/" element={<Portfolio />} />
        <Route
          path="/gft"
          element={
            <Suspense fallback={null}>
              <GithubFollowerTracker />
            </Suspense>
          }
        />
        <Route
          path="/ajfoucault/*"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
