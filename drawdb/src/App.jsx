// 3dfolio: upstream App.jsx served under /dbdesign, without the landing page, bug report and migration banner.
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useLayoutEffect } from "react";
import Editor from "./pages/Editor";
import Templates from "./pages/Templates";
import SettingsContextProvider from "./context/SettingsContext";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter basename="/dbdesign">
      <SettingsContextProvider>
        <RestoreScroll />
        <Routes>
          <Route path="/" element={<Navigate to="/editor" replace />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/editor/diagrams/:id" element={<Editor />} />
          <Route path="/editor/templates/:id" element={<Editor />} />
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
