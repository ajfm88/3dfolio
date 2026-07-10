import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Briefcase,
  User,
  Cpu,
  FolderGit2,
  Mail,
  LogOut,
} from "lucide-react";

import ExperienceManager from "./ExperienceManager";

// Only "Experience" is live today. The rest are placeholders for the later steps
// of the no-more-hardcoding migration and are shown disabled.
const NAV_ITEMS = [
  { name: "Experience", icon: Briefcase, color: "#818cf8", live: true },
  { name: "About", icon: User, color: "#f472b6", live: false },
  { name: "Tech Stack", icon: Cpu, color: "#34d399", live: false },
  { name: "Projects", icon: FolderGit2, color: "#fbbf24", live: false },
  { name: "Contact", icon: Mail, color: "#60a5fa", live: false },
];

const AdminShell = ({ user, logout }) => {
  const [open, setOpen] = useState(true);
  const [active] = useState("Experience");

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 opacity-80" />
        <div className="absolute inset-0 backdrop-blur-sm" />
      </div>

      {/* Sidebar */}
      <motion.div
        className="relative z-10 flex-shrink-0"
        animate={{ width: open ? 256 : 80 }}
      >
        <div className="h-full bg-gray-800/50 backdrop-blur-md p-4 flex flex-col border-r border-gray-700">
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors max-w-fit"
            aria-label="Toggle sidebar"
          >
            <Menu size={24} />
          </button>

          <nav className="mt-8 flex-grow">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.name}
                title={item.live ? item.name : `${item.name} (coming soon)`}
                className={`flex items-center p-4 text-sm font-medium rounded-lg mb-2 ${
                  item.name === active
                    ? "bg-gray-700"
                    : item.live
                      ? "hover:bg-gray-700 cursor-pointer"
                      : "opacity-40 cursor-not-allowed"
                }`}
              >
                <item.icon size={20} style={{ color: item.color, minWidth: 20 }} />
                <AnimatePresence>
                  {open && (
                    <motion.span
                      className="ml-4 whitespace-nowrap"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </nav>
        </div>
      </motion.div>

      {/* Main */}
      <div className="relative z-10 flex-1 flex flex-col overflow-auto">
        <header className="bg-gray-800/50 backdrop-blur-md border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Content Manager</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 hidden sm:inline">{user.email}</span>
            {user.photoURL && (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
            )}
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors px-3 py-2 text-sm"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </header>

        <main className="p-6">
          <ExperienceManager />
        </main>
      </div>
    </div>
  );
};

export default AdminShell;
