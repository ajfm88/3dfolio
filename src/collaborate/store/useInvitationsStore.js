import { create } from "zustand";
import { toast } from "react-toastify";
import { axiosInstance } from "../lib/axios";
import { useProjectsStore } from "./useProjectsStore";

// Requests choose the newest list; generations isolate account reloads and mutations.
let request = 0;
let generation = 0;
export const useInvitationsStore = create((set, get) => {
  const load = async (reset) => {
    const serial = ++request;
    if (reset) {
      generation += 1;
      set({ invites: [], hasLoaded: false, busy: null });
    }
    try {
      const res = await axiosInstance.get("/projects/invites/mine");
      if (serial === request) set({ invites: res.data.invites, hasLoaded: true });
    } catch (error) {
      if (serial !== request) return;
      if (reset) {
        toast.error("Failed to load your invitations");
        set({ invites: [], hasLoaded: true });
      }
    }
  };
  const respond = async (invite, action) => {
    if (get().busy) return false;
    const serial = generation;
    set({ busy: `${action}:${invite._id}` });
    try {
      await axiosInstance.post(`/projects/invites/${invite._id}/${action}`);
      if (serial !== generation) return false;
      // An older refresh must not restore an invitation that was just consumed.
      request += 1;
      set((state) => ({ invites: state.invites.filter((item) => item._id !== invite._id) }));
      if (action === "accept") {
        useProjectsStore.getState().refreshProjects();
        toast.success(`You joined ${invite.project.name}`);
      } else toast.success("Invitation declined");
      return true;
    } catch (error) {
      if (serial !== generation) return false;
      toast.error(error.response?.data?.message || `Failed to ${action} the invitation`);
      get().refreshInvites();
      return false;
    } finally {
      if (serial === generation) set({ busy: null });
    }
  };
  return {
    invites: [],
    hasLoaded: false,
    busy: null,
    loadInvites: () => load(true),
    refreshInvites: () => load(false),
    accept: (invite) => respond(invite, "accept"),
    decline: (invite) => respond(invite, "decline"),
  };
});
