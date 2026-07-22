import { format } from "timeago.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { api } from "../lib/axios";
import { useBlogUsername } from "../lib/useBlogUsername";
import { useIsAdmin } from "../lib/useIsAdmin";
import Image from "./Image";

// A single comment: avatar, author handle, relative timestamp, body, and a
// delete control for the comment's own author or an admin. Delete goes through
// the shared `api` instance (DELETE /api/comments/:id), so the Clerk bearer
// token attaches on the one interceptor path instead of a per-call getToken().
//
// The visibility check below is UI-only: deleteComment scopes non-admins to
// their own comments inside the Mongo query, so a bypassed control still 403s.
const Comment = ({ comment, postId }) => {
  const isAdmin = useIsAdmin();
  const username = useBlogUsername();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.delete(`/comments/${comment._id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      toast.success("Comment deleted successfully!");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to delete comment");
    },
  });

  // `_id` is the guard for the optimistic placeholder Comments renders while a
  // new comment is in flight: it has no server id yet, so there is nothing to
  // delete and the control would fire at /comments/undefined.
  const canDelete =
    !!comment._id &&
    !!username &&
    (isAdmin || comment.user?.username === username);

  return (
    <div className="p-4 bg-slate-50 rounded-xl mb-8">
      <div className="flex items-center gap-4">
        {comment.user?.img && (
          <Image
            src={comment.user.img}
            className="w-10 h-10 rounded-full object-cover"
            w="40"
            h="40"
            alt={comment.user.username}
          />
        )}
        <span className="font-medium">{comment.user?.username}</span>
        <span className="text-sm text-gray-500">
          {format(comment.createdAt)}
        </span>
        {canDelete && (
          <span
            className="text-xs text-red-300 hover:text-red-500 cursor-pointer"
            onClick={() => mutation.mutate()}
          >
            delete
            {mutation.isPending && <span> (in progress)</span>}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p>{comment.desc}</p>
      </div>
    </div>
  );
};

export default Comment;
