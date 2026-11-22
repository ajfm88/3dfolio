// 3dfolio: temporary App.jsx for D6 (templates gallery). D9 replaces it with upstream App.jsx.
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useLayoutEffect } from "react";
import Templates from "./pages/Templates";
import SettingsContextProvider from "./context/SettingsContext";
import NotFound from "./pages/NotFound";

function Placeholder() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-lg text-zinc-600">drawDB is being set up.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/drawdb">
      <SettingsContextProvider>
        <RestoreScroll />
        <Routes>
          <Route path="/" element={<Placeholder />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SettingsContextProvider>
    </BrowserRouter>
  );
}

function RestoreScroll() {
  const location = useLocation();
  useLayoutEffect(() => {
    window.scroll(0, 0);
  }, [location.pathname]);
  return null;
}
