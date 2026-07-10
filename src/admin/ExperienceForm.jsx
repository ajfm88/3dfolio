import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, X, Upload, Loader2 } from "lucide-react";

import { uploadIcon } from "./experiencesApi";

const labelClass = "block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1";
const inputClass =
  "w-full bg-gray-700 text-white placeholder-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// Modal editor for a single experience. Handles the logo upload itself (Storage),
// then hands a plain data object back to the parent via onSubmit.
const ExperienceForm = ({ experience, onSubmit, onClose }) => {
  const [form, setForm] = useState(experience);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(experience.iconUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setPoint = (index, value) =>
    setForm((f) => ({ ...f, points: f.points.map((p, i) => (i === index ? value : p)) }));
  const addPoint = () => setForm((f) => ({ ...f, points: [...f.points, ""] }));
  const removePoint = (index) =>
    setForm((f) => ({ ...f, points: f.points.filter((_, i) => i !== index) }));

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
      let iconUrl = form.iconUrl;
      if (file) {
        iconUrl = await uploadIcon(file);
      }
      await onSubmit({ ...form, iconUrl });
    } catch (err) {
      setError(err?.message || "Could not save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl my-8 bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-100">
            {experience.id ? "Edit experience" : "Add experience"}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelClass}>Title</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Full Stack Software Developer"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Company name</label>
            <input
              className={inputClass}
              value={form.company_name}
              onChange={(e) => setField("company_name", e.target.value)}
              placeholder="Digar · Self-employed"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Company URL (optional)</label>
            <input
              className={inputClass}
              value={form.company_url}
              onChange={(e) => setField("company_url", e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className={labelClass}>Date range</label>
            <input
              className={inputClass}
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              placeholder="Aug 2025 - Present"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Icon background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.iconBg}
                onChange={(e) => setField("iconBg", e.target.value)}
                className="h-10 w-12 rounded bg-gray-700 border border-gray-600 cursor-pointer"
              />
              <input
                className={inputClass}
                value={form.iconBg}
                onChange={(e) => setField("iconBg", e.target.value)}
                placeholder="#383E56"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Company logo</label>
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border border-gray-600 flex-shrink-0"
                style={{ background: form.iconBg }}
              >
                {preview ? (
                  <img src={preview} alt="logo preview" className="w-[95%] h-[95%] object-contain" />
                ) : (
                  <span className="text-[10px] text-gray-400">no logo</span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 text-sm cursor-pointer">
                <Upload size={16} />
                {file ? "Change file" : "Upload logo"}
                <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass + " mb-0"}>Bullet points</label>
            <button
              type="button"
              onClick={addPoint}
              className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
            >
              <Plus size={16} /> Add point
            </button>
          </div>
          <div className="space-y-2">
            {form.points.map((point, index) => (
              <div key={index} className="flex gap-2">
                <textarea
                  className={inputClass + " min-h-[42px] resize-y"}
                  rows={2}
                  value={point}
                  onChange={(e) => setPoint(index, e.target.value)}
                  placeholder="Describe an accomplishment…"
                />
                <button
                  type="button"
                  onClick={() => removePoint(index)}
                  className="text-red-400 hover:text-red-300 flex-shrink-0 self-start pt-2"
                  aria-label="Remove point"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {form.points.length === 0 && (
              <p className="text-sm text-gray-500">No bullet points yet — add one above.</p>
            )}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
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
    </div>
  );
};

export default ExperienceForm;
