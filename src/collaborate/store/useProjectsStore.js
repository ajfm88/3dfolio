import { create } from "zustand";
import { toast } from "react-toastify";

import { axiosInstance } from "../lib/axios";

// StrictMode and mutation refreshes can overlap. Only the most recent list
// request may replace the dashboard or finish its loading/error state.
let listRequest = 0;

export const useProjectsStore = create((set, get) => ({
  owned: [],
  shared: [],
  isLoading: false,
  hasLoaded: false,
  loadError: false,

  loadProjects: async () => {
    const request = ++listRequest;
    // The store outlives the route. Re-entry and account switches must discard
    // the previous visit's lists before loading the current user's projects.
    set({ owned: [], shared: [], hasLoaded: false, loadError: false, isLoading: true });
    try {
      const res = await axiosInstance.get("/projects");
      if (request !== listRequest) return;
      set({ owned: res.data.owned, shared: res.data.shared, hasLoaded: true });
    } catch (error) {
      if (request !== listRequest) return;
      toast.error(error.response?.data?.message || "Failed to load your projects");
      set({ loadError: true });
    } finally {
      if (request === listRequest) set({ isLoading: false });
    }
  },

  refreshProjects: async () => {
    const request = ++listRequest;
    try {
      const res = await axiosInstance.get("/projects");
      if (request !== listRequest) return;
      set({ owned: res.data.owned, shared: res.data.shared, hasLoaded: true, loadError: false });
    } catch (error) {
      if (request !== listRequest) return;
      // A mutation already succeeded; keep the useful lists if refresh fails.
      toast.error(error.response?.data?.message || "Failed to load your projects");
    }
  },

  createProject: async (input) => {
    try {
      const res = await axiosInstance.post("/projects", input);
      get().refreshProjects();
      return res.data.project;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create the project");
      return null;
    }
  },

  updateProject: async (id, patch) => {
    try {
      await axiosInstance.patch(`/projects/${id}`, patch);
      await get().refreshProjects();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update the project");
      if (error.response?.status === 404) await get().refreshProjects();
      return false;
    }
  },

  deleteProject: async (id) => {
    try {
      await axiosInstance.delete(`/projects/${id}`);
      await get().refreshProjects();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete the project");
      if (error.response?.status === 404) await get().refreshProjects();
      return false;
    }
  },
}));
