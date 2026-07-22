import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { api } from "../lib/axios";
import { useBlogUsername } from "../lib/useBlogUsername";
import { useIsAdmin } from "../lib/useIsAdmin";

// Admin/owner controls for a single post, shown in the sidebar:
//   - Feature (admin only) toggles isFeatured via PATCH /api/posts/feature.
//   - Delete (admin or the post's author) removes the post via DELETE /api/posts/:id.
// Both go through the shared `api` instance so the Clerk bearer token attaches on
// the one interceptor path, and both are only UI-gated here — the API enforces
// the same admin/ownership rules independently, so a bypassed button still 401/403s.
//
// A per-user "save post" action is intentionally left out: saved posts are cut
// from v1 (there is no /users/save endpoint), so rendering it would only surface
// a control that can't work.
const PostMenuActions = ({ post }) => {
  const isAdmin = useIsAdmin();
  const username = useBlogUsername();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const featureMutation = useMutation({
    mutationFn: () => api.patch("/posts/feature", { postId: post._id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", post.slug] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to feature post");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/posts/${post._id}`),
    onSuccess: () => {
      toast.success("Post deleted successfully!");
      navigate("/blog");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to delete post");
    },
  });

  // UI-only ownership check; deletePost is owner-scoped in the backend query, so
  // this never has to be trusted on its own. Compares against the derived handle
  // rather than Clerk's own `user.username`, which is null under this app's
  // sign-in methods — see useBlogUsername.
  const canDelete = isAdmin || (!!username && post.user?.username === username);

  return (
    <div className="">
      <h1 className="mt-8 mb-4 text-sm font-medium">Actions</h1>
      {isAdmin && (
        <div
          className="flex items-center gap-2 py-2 text-sm cursor-pointer"
          onClick={() => featureMutation.mutate()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            width="20px"
            height="20px"
          >
            <path
              d="M24 2L29.39 16.26L44 18.18L33 29.24L35.82 44L24 37L12.18 44L15 29.24L4 18.18L18.61 16.26L24 2Z"
              stroke="black"
              strokeWidth="2"
              fill={
                featureMutation.isPending
                  ? post.isFeatured
                    ? "none"
                    : "black"
                  : post.isFeatured
                  ? "black"
                  : "none"
              }
            />
          </svg>
          <span>Feature</span>
          {featureMutation.isPending && (
            <span className="text-xs">(in progress)</span>
          )}
        </div>
      )}
      {canDelete && (
        <div
          className="flex items-center gap-2 py-2 text-sm cursor-pointer"
          onClick={() => deleteMutation.mutate()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 50 50"
            fill="red"
            width="20px"
            height="20px"
          >
            <path d="M 21 2 C 19.354545 2 18 3.3545455 18 5 L 18 7 L 10.154297 7 A 1.0001 1.0001 0 0 0 9.984375 6.9863281 A 1.0001 1.0001 0 0 0 9.8398438 7 L 8 7 A 1.0001 1.0001 0 1 0 8 9 L 9 9 L 9 45 C 9 46.645455 10.354545 48 12 48 L 38 48 C 39.645455 48 41 46.645455 41 45 L 41 9 L 42 9 A 1.0001 1.0001 0 1 0 42 7 L 40.167969 7 A 1.0001 1.0001 0 0 0 39.841797 7 L 32 7 L 32 5 C 32 3.3545455 30.645455 2 29 2 L 21 2 z M 21 4 L 29 4 C 29.554545 4 30 4.4454545 30 5 L 30 7 L 20 7 L 20 5 C 20 4.4454545 20.445455 4 21 4 z M 11 9 L 18.832031 9 A 1.0001 1.0001 0 0 0 19.158203 9 L 30.832031 9 A 1.0001 1.0001 0 0 0 31.158203 9 L 39 9 L 39 45 C 39 45.554545 38.554545 46 38 46 L 12 46 C 11.445455 46 11 45.554545 11 45 L 11 9 z M 18.984375 13.986328 A 1.0001 1.0001 0 0 0 18 15 L 18 40 A 1.0001 1.0001 0 1 0 20 40 L 20 15 A 1.0001 1.0001 0 0 0 18.984375 13.986328 z M 24.984375 13.986328 A 1.0001 1.0001 0 0 0 24 15 L 24 40 A 1.0001 1.0001 0 1 0 26 40 L 26 15 A 1.0001 1.0001 0 0 0 24.984375 13.986328 z M 30.984375 13.986328 A 1.0001 1.0001 0 0 0 30 15 L 30 40 A 1.0001 1.0001 0 1 0 32 40 L 32 15 A 1.0001 1.0001 0 0 0 30.984375 13.986328 z" />
          </svg>
          <span>Delete this Post</span>
          {deleteMutation.isPending && (
            <span className="text-xs">(in progress)</span>
          )}
        </div>
      )}
    </div>
  );
};

export default PostMenuActions;
