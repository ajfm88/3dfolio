import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Plus, Trash2, X, Upload, Loader2 } from "lucide-react";

import { uploadProjectImage, TAG_COLOR_PRESETS } from "./projectsApi";

const labelClass = "block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1";
const inputClass =
  "w-full bg-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// Modal editor for a single project. Handles the image upload itself (Storage),
// then hands a plain data object back to the parent via onSubmit.
const ProjectForm = ({ project, onSubmit, onClose }) => {
  const [form, setForm] = useState(project);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(project.imageUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setTag = (index, key, value) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    }));
  const addTag = () =>
    setForm((f) => ({
      ...f,
      tags: [...f.tags, { name: "", color: TAG_COLOR_PRESETS[0].value }],
    }));
  const removeTag = (index) =>
    setForm((f) => ({ ...f, tags: f.tags.filter((_, i) => i !== index) }));

  const onFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      let imageUrl = form.imageUrl;
      if (file) {
        imageUrl = await uploadProjectImage(file);
      }
      await onSubmit({ ...form, imageUrl });
    } catch (err) {
      setError(err?.message || "Could not save. Please try again.");
      setSaving(false);
    }
  };

  // Rendered into a portal so the modal's `fixed` positioning is relative to the
  // real viewport, not to ProjectManager's animated (transformed) wrapper — a
  // transformed ancestor becomes the containing block for `position: fixed`.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[85vh] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-100">
            {project.id ? "Edit project" : "Add project"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelClass}>Name</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="AI Resume Builder"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              className={inputClass + " min-h-[70px] resize-y"}
              rows={3}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="A Full Stack, ChatGPT-powered SaaS application…"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Live URL</label>
            <input
              className={inputClass}
              value={form.url}
              onChange={(e) => setField("url", e.target.value)}
              placeholder="https://example.vercel.app"
            />
          </div>

          <div>
            <label className={labelClass}>Source code link</label>
            <input
              className={inputClass}
              value={form.source_code_link}
              onChange={(e) => setField("source_code_link", e.target.value)}
              placeholder="https://github.com/ajfm88/example"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Project image</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-14 rounded-lg flex items-center justify-center overflow-hidden border border-gray-600 bg-gray-700 flex-shrink-0">
                {preview ? (
                  <img src={preview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-gray-400">no image</span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 text-sm cursor-pointer">
                <Upload size={16} />
                {file ? "Change file" : "Upload image"}
                <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Recommended ~1000×700px (3:2 landscape) — the card crops to fit, so an
              image far from this ratio will be cropped more aggressively.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass + " mb-0"}>Tags</label>
            <button
              type="button"
              onClick={addTag}
              className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
            >
              <Plus size={16} /> Add tag
            </button>
          </div>
          <div className="space-y-2">
            {form.tags.map((tag, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className={inputClass}
                  value={tag.name}
                  onChange={(e) => setTag(index, "name", e.target.value)}
                  placeholder="react"
                />
                <select
                  className={inputClass + " sm:max-w-[140px]"}
                  value={tag.color}
                  onChange={(e) => setTag(index, "color", e.target.value)}
                >
                  {TAG_COLOR_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeTag(index)}
                  className="text-red-400 hover:text-red-300 flex-shrink-0"
                  aria-label="Remove tag"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {form.tags.length === 0 && (
              <p className="text-sm text-gray-500">No tags yet — add one above.</p>
            )}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-5 py-2 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 transition-colors px-5 py-2 font-medium"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </motion.form>
    </div>,
    document.body
  );
};

export default ProjectForm;
