import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Briefcase,
  User,
  FolderGit2,
  LogOut,
} from "lucide-react";

import AboutManager from "./AboutManager";
import ExperienceManager from "./ExperienceManager";
import ProjectManager from "./ProjectManager";

// Every editable section is live: About was the last one still hardcoded. Tech
// Stack and Contact are intentionally excluded — staying hardcoded by choice.
// Ordered to match the order the sections appear on the portfolio itself, so the
// panel list reads as a map of the page rather than the order they were built in.
const NAV_ITEMS = [
  { name: "About", icon: User, color: "#f472b6", live: true },
  { name: "Experience", icon: Briefcase, color: "#818cf8", live: true },
  { name: "Projects", icon: FolderGit2, color: "#fbbf24", live: true },
];

const PANELS = {
  About: AboutManager,
  Experience: ExperienceManager,
  Projects: ProjectManager,
};

const AdminShell = ({ user, logout }) => {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(NAV_ITEMS[0].name);
  const ActivePanel = PANELS[active];

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
                onClick={() => item.live && setActive(item.name)}
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
          <ActivePanel />
        </main>
      </div>
    </div>
  );
};

export default AdminShell;
