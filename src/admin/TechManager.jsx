import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, RotateCcw, Upload } from "lucide-react";

import { loadTech, saveTech, uploadTechIcon } from "./techApi";
import { mergeTechFaces, TECH_ROTATIONS } from "../constants/tech";

const EMPTY_FILES = [null, null, null, null, null, null];

// Only the stored fields take part in the dirty check. `src` is derived from
// `imageUrl` and would make an untouched face look changed the moment it resolved
// to a bundled asset URL.
const serialize = (faces) =>
  JSON.stringify(
    faces.map(({ label, imageUrl, rotation }) => ({ label, imageUrl, rotation }))
  );

const TechManager = () => {
  const [faces, setFaces] = useState(() => mergeTechFaces([]));
  const [persisted, setPersisted] = useState("");
  // Files picked but not uploaded yet. Nothing reaches Storage until Save, so
  // backing out of a change costs nothing and leaves no orphaned upload behind.
  const [files, setFiles] = useState(EMPTY_FILES);
  const [previews, setPreviews] = useState(EMPTY_FILES);
  // Whether a document exists at all, which is a different question from whether
  // anything has changed — before the first save the panel holds the shipped cube,
  // so nothing looks changed even though nothing has been written.
  const [stored, setStored] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Object URLs are revoked through a ref rather than in the effect that creates
  // them, so a preview survives re-renders and is released exactly once — on
  // replacement, on save, or when the panel goes away.
  const previewUrls = useRef([]);

  useEffect(() => {
    let cancelled = false;

    loadTech()
      .then((result) => {
        if (cancelled) return;
        setFaces(result.faces);
        setPersisted(serialize(result.faces));
        setStored(result.stored);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load the cube.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => url && URL.revokeObjectURL(url));
    },
    []
  );

  const pending = files.some(Boolean);
  const dirty = serialize(faces) !== persisted;
  // Saving is offered while nothing is stored even with an untouched cube: that
  // save is what creates the document in the first place.
  const canSave = dirty || pending || !stored;

  const updateFace = (index, patch) => {
    setFaces((current) =>
      current.map((face, i) => (i === index ? { ...face, ...patch } : face))
    );
  };

  const clearPreview = (index) => {
    const url = previewUrls.current[index];
    if (url) URL.revokeObjectURL(url);
    previewUrls.current[index] = null;
  };

  const handleFile = (index, file) => {
    if (!file) return;
    clearPreview(index);
    const url = URL.createObjectURL(file);
    previewUrls.current[index] = url;
    setFiles((current) => current.map((f, i) => (i === index ? file : f)));
    setPreviews((current) => current.map((p, i) => (i === index ? url : p)));
  };

  const handleRestore = () => {
    previewUrls.current.forEach((_, i) => clearPreview(i));
    setFaces(mergeTechFaces([]));
    setFiles(EMPTY_FILES);
    setPreviews(EMPTY_FILES);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      // Uploads run first so a Storage failure aborts before anything is written:
      // a document pointing at an image that never arrived would break the cube
      // for every visitor, which is worse than the save simply not happening.
      const next = await Promise.all(
        faces.map(async (face, index) => {
          const label = face.label.trim() || `Face ${index + 1}`;
          const file = files[index];
          if (!file) return { ...face, label };
          const imageUrl = await uploadTechIcon(file);
          return { ...face, label, imageUrl, src: imageUrl };
        })
      );

      await saveTech(next);

      next.forEach((_, i) => clearPreview(i));
      setFaces(next);
      setPersisted(serialize(next));
      setFiles(EMPTY_FILES);
      setPreviews(EMPTY_FILES);
      setStored(true);
      setStatus("Saved. The live site picks this up on its next load.");
    } catch (err) {
      setError(err?.message || "Could not save the cube.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="bg-gray-800 bg-opacity-50 backdrop-blur-md shadow-lg rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-100">Tech Stack</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRestore}
            disabled={loading || saving}
            title="Replace the draft with the cube built into the site"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:hover:bg-gray-700"
          >
            <RotateCcw size={16} /> Restore shipped cube
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving || !canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving…" : canSave ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {status && !canSave && <p className="mb-4 text-sm text-emerald-400">{status}</p>}

      {!loading && !stored && (
        <p className="mb-4 text-sm text-amber-400">
          Nothing stored yet — the live site is rendering the cube built into the bundle.
          The six faces below are already that cube, so save once to start managing it
          here; there is nothing to re-enter.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-gray-500 leading-relaxed">
            Six faces, always — the cube has no other sides to add or remove. Each
            preview is what that face looks like as it turns to the front, so a logo
            that reads sideways there reads sideways on the site.
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            {faces.map((face, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-700 bg-gray-900 p-4 flex gap-4"
              >
                <div className="shrink-0">
                  <div className="h-20 w-20 rounded-lg border border-gray-600 bg-white/30 flex items-center justify-center overflow-hidden">
                    <img
                      src={previews[index] || face.src}
                      alt=""
                      className="h-12 w-12 object-contain transition-transform"
                      style={{ transform: `rotate(${face.rotation}deg)` }}
                    />
                  </div>
                  <span className="mt-1 block text-center text-[10px] font-medium uppercase tracking-wider text-gray-500">
                    Face {index + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`tech-label-${index}`}
                    className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1"
                  >
                    Label
                  </label>
                  <input
                    id={`tech-label-${index}`}
                    value={face.label}
                    onChange={(e) => updateFace(index, { label: e.target.value })}
                    placeholder={`Face ${index + 1}`}
                    className="w-full bg-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Turn
                    </span>
                    <div className="inline-flex rounded-lg border border-gray-600 overflow-hidden">
                      {TECH_ROTATIONS.map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => updateFace(index, { rotation: deg })}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                            face.rotation === deg
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-3 py-1.5 text-xs cursor-pointer">
                    <Upload size={14} />
                    {files[index] ? "Change image" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFile(index, e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                  {files[index] && (
                    <p className="mt-1 text-[11px] text-amber-400">
                      Uploads when you save.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default TechManager;
