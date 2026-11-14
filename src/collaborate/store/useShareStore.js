import { create } from "zustand";
import { toast } from "react-toastify";
import { axiosInstance } from "../lib/axios";
import { useSessionStore } from "./useSessionStore";
import { markSelfLeave, clearSelfLeave, exitWorkspace } from "./useWorkspaceStore";

// Loads are latest-wins; generations also distinguish reopening the same project.
let request = 0;
let generation = 0;
const initial = { projectId: null, detail: null, viewerRole: null, status: "idle", busy: null };
export const useShareStore = create((set, get) => {
  const load = async (id, clear) => {
    const serial = ++request;
    set(
      clear
        ? { projectId: id, detail: null, viewerRole: null, status: "loading", busy: null }
        : { status: "loading" },
    );
    try {
      const response = await axiosInstance.get(`/projects/${id}`);
      if (serial !== request || get().projectId !== id) return;
      set({ detail: response.data.project, viewerRole: response.data.role, status: "ready" });
    } catch (error) {
      if (serial !== request || get().projectId !== id) return;
      if (error.response?.status === 404) {
        toast.error(error.response?.data?.message || "Project not found");
        get().close();
      } else {
        toast.error(error.response?.data?.message || "Failed to load members");
        set({ status: "error" });
      }
    }
  };
  const mutate = async (key, action, success, fallback) => {
    const id = get().projectId;
    const current = generation;
    if (!id || get().busy) return false;
    set({ busy: key });
    try {
      await action(id);
      if (get().projectId !== id || generation !== current) return false;
      toast.success(success);
      get().reload();
      return true;
    } catch (error) {
      if (get().projectId !== id || generation !== current) return false;
      const message = error.response?.data?.message || fallback;
      toast.error(message);
      if (error.response?.status === 404 && message === "Project not found") get().close();
      else get().reload();
      return false;
    } finally {
      if (get().projectId === id && generation === current) set({ busy: null });
    }
  };
  return {
    ...initial,
    open: (id) => {
      generation += 1;
      return load(id, true);
    },
    close: () => {
      request += 1;
      generation += 1;
      set(initial);
    },
    reload: () => {
      const id = get().projectId;
      if (id) return load(id, false);
    },
    invite: (email, role) =>
      mutate(
        "invite",
        (id) => axiosInstance.post(`/projects/${id}/invites`, { email: email.trim(), role }),
        "Invitation sent",
        "Failed to send the invitation",
      ),
    revokeInvite: (inviteId) =>
      mutate(
        `revoke:${inviteId}`,
        (id) => axiosInstance.delete(`/projects/${id}/invites/${inviteId}`),
        "Invitation revoked",
        "Failed to revoke the invitation",
      ),
    changeRole: (userId, role) =>
      mutate(
        `role:${userId}`,
        (id) => axiosInstance.patch(`/projects/${id}/members/${userId}`, { role }),
        "Role updated",
        "Failed to change the role",
      ),
    removeMember: (userId) =>
      mutate(
        `remove:${userId}`,
        (id) => axiosInstance.delete(`/projects/${id}/members/${userId}`),
        "Member removed",
        "Failed to remove the member",
      ),
    leave: async () => {
      const id = get().projectId;
      const current = generation;
      const self = useSessionStore.getState().authUser?._id;
      if (!id || !self || get().busy) return false;
      set({ busy: "leave" });
      markSelfLeave(id);
      try {
        await axiosInstance.delete(`/projects/${id}/members/${self}`);
        if (get().projectId !== id || generation !== current) return false;
        // The socket event uses the same id, so both paths show one toast.
        toast.success("You left the project", { toastId: `workspace-exit-${id}` });
        exitWorkspace(id);
        get().close();
        return true;
      } catch (error) {
        if (get().projectId !== id || generation !== current) return false;
        clearSelfLeave(id);
        toast.error(error.response?.data?.message || "Failed to leave the project");
        get().reload();
        return false;
      } finally {
        if (get().projectId === id && generation === current) set({ busy: null });
      }
    },
  };
});
