import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Edit, Trash2, ArrowUp, ArrowDown, Plus, Loader2 } from "lucide-react";

import {
  listProjects,
  createProject,
  updateProject,
  removeProject,
  moveProject,
  emptyProject,
} from "./projectsApi";
import ProjectForm from "./ProjectForm";

const ProjectManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // project object or null

  const refresh = async () => {
    setError("");
    try {
      setItems(await listProjects());
    } catch (err) {
      setError(err?.message || "Could not load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = () => setEditing(emptyProject(items.length));

  const handleSubmit = async (data) => {
    if (data.id) {
      await updateProject(data.id, data);
    } else {
      await createProject(data);
    }
    setEditing(null);
    await refresh();
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await removeProject(item.id);
    await refresh();
  };

  const handleMove = async (index, direction) => {
    await moveProject(items, index, direction);
    await refresh();
  };

  return (
    <motion.div
      className="bg-gray-800 bg-opacity-50 backdrop-blur-md shadow-lg rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-100">Projects</h2>
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} /> Add project
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-400 py-10 text-center">
          No projects yet. Click <span className="text-gray-200">Add project</span> to add one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr>
                {["Order", "Project", "Tags", "Links", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <button
                        onClick={() => handleMove(index, -1)}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-white disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMove(index, 1)}
                        disabled={index === items.length - 1}
                        className="text-gray-400 hover:text-white disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="w-14 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700 flex items-center justify-center">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </span>
                      <span className="max-w-xs">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-400">
                    {item.tags?.map((t) => t.name).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-4 text-sm whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          Live
                        </a>
                      )}
                      {item.source_code_link && (
                        <a
                          href={item.source_code_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-300"
                        >
                          Source
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <button
                      onClick={() => setEditing(item)}
                      className="text-indigo-400 hover:text-indigo-300 mr-3"
                      aria-label="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="text-red-400 hover:text-red-300"
                      aria-label="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProjectForm project={editing} onSubmit={handleSubmit} onClose={() => setEditing(null)} />
      )}
    </motion.div>
  );
};

export default ProjectManager;
