// 3dfolio: temporary placeholder. D6 extends it and D9 replaces it with upstream App.jsx.
import { BrowserRouter, Routes, Route } from "react-router-dom";

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
      <Routes>
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </BrowserRouter>
  );
}
