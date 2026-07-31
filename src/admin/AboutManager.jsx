import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, RotateCcw } from "lucide-react";

import { loadAbout, saveAbout } from "./aboutApi";
import { DEFAULT_ABOUT } from "../constants/about";
import { parseRichText } from "../utils/richText";

const AboutManager = () => {
  const [body, setBody] = useState("");
  // The last persisted value, kept alongside the draft purely so the Save button
  // can tell whether anything actually changed.
  const [persisted, setPersisted] = useState("");
  // Whether a document exists at all, which is not the same question as whether
  // the text has changed — before the first save the editor holds the shipped
  // copy, so nothing looks changed even though nothing has been written.
  const [stored, setStored] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    loadAbout()
      .then((result) => {
        if (cancelled) return;
        setBody(result.body);
        setPersisted(result.body);
        setStored(result.stored);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load the About text.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = body !== persisted;
  // Saving is offered while nothing is stored even with an untouched draft: that
  // save is what creates the document in the first place.
  const canSave = dirty || !stored;

  // The preview runs the draft through the same parser the public section uses,
  // so what shows here is what the site will render — the markup can't drift.
  const blocks = useMemo(() => parseRichText(body), [body]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const trimmed = body.trim();
      await saveAbout(trimmed);
      setBody(trimmed);
      setPersisted(trimmed);
      setStored(true);
      setStatus("Saved. The live site picks this up on its next load.");
    } catch (err) {
      setError(err?.message || "Could not save the About text.");
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
        <h2 className="text-xl font-semibold text-gray-100">About</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setBody(DEFAULT_ABOUT)}
            disabled={loading || body === DEFAULT_ABOUT}
            title="Replace the draft with the copy built into the site"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:hover:bg-gray-700"
          >
            <RotateCcw size={16} /> Restore shipped copy
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
      {status && !dirty && <p className="mb-4 text-sm text-emerald-400">{status}</p>}

      {!loading && !stored && (
        <p className="mb-4 text-sm text-amber-400">
          Nothing stored yet — the live site is rendering the copy built into the bundle.
          The text below is already that copy, so save once to start managing it here;
          there is nothing to retype.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label
              htmlFor="about-body"
              className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2"
            >
              Text
            </label>
            <textarea
              id="about-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
              rows={18}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 focus:border-indigo-500 focus:outline-none p-3 text-sm text-gray-100 leading-relaxed resize-y"
            />
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              <span className="text-gray-400">[label](https://url)</span> makes a link and{" "}
              <span className="text-gray-400">**text**</span> makes it bold; the two can be
              nested. A blank line starts a new paragraph, a single newline is just a line
              break.
            </p>
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Preview
            </span>
            <div className="rounded-lg bg-gray-900 border border-gray-700 p-4 text-sm text-gray-300 leading-relaxed [&_a]:text-indigo-400 [&_a]:underline">
              {blocks.length === 0 ? (
                <p className="text-gray-500">Nothing to show yet.</p>
              ) : (
                blocks.map((nodes, i) => (
                  <p key={i} className={i > 0 ? "mt-4" : undefined}>
                    {nodes}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default AboutManager;
