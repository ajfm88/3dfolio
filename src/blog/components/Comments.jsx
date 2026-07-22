import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { api } from "../lib/axios";
import { useBlogUsername } from "../lib/useBlogUsername";
import Comment from "./Comment";

// The comment thread under a post: a public read (GET /api/comments/:postId,
// newest first) plus a write form for signed-in visitors (POST to the same
// path). Signed-out readers see the thread and a sign-in prompt in place of the
// form — the API rejects an anonymous POST anyway, so offering the textarea
// would only lead to a 401 toast.
//
// While a comment is in flight the new one is rendered optimistically above the
// list from `mutation.variables`, then the real thread is invalidated and
// refetched on success.
const fetchComments = async (postId) => {
  const res = await api.get(`/comments/${postId}`);
  return res.data;
};

const Comments = ({ postId }) => {
  const { user } = useUser();
  const username = useBlogUsername();
  const queryClient = useQueryClient();

  const { isPending, error, data } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => fetchComments(postId),
  });

  const mutation = useMutation({
    mutationFn: (newComment) => api.post(`/comments/${postId}`, newComment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to post comment");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    const form = e.target;
    const desc = new FormData(form).get("desc")?.trim();

    // The API 400s on an empty body; no reason to spend the round trip.
    if (!desc) return;

    mutation.mutate({ desc });
    form.reset();
  };

  const comments = data || [];

  return (
    <div className="flex flex-col gap-8 lg:w-3/5 mb-12">
      <h1 className="text-xl text-gray-500 underline">Comments</h1>

      <SignedIn>
        <form
          onSubmit={handleSubmit}
          className="flex items-center justify-between gap-8 w-full"
        >
          <textarea
            name="desc"
            placeholder="Write a comment..."
            className="w-full p-4 rounded-xl"
          />
          <button
            disabled={mutation.isPending}
            className="bg-blue-800 px-4 py-3 text-white font-medium rounded-xl disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? "Sending..." : "Send"}
          </button>
        </form>
      </SignedIn>
      <SignedOut>
        <p className="text-gray-500">
          <SignInButton mode="modal">
            <button className="text-blue-800 underline">Sign in</button>
          </SignInButton>{" "}
          to leave a comment.
        </p>
      </SignedOut>

      {isPending ? (
        <p className="text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-red-500">
          Something went wrong! {error.message}
        </p>
      ) : (
        <>
          {mutation.isPending && (
            <Comment
              comment={{
                desc: `${mutation.variables.desc} (Sending...)`,
                createdAt: new Date(),
                user: {
                  img: user?.imageUrl,
                  username,
                },
              }}
            />
          )}
          {comments.length === 0 && !mutation.isPending ? (
            <p className="text-gray-500">
              No comments yet. Be the first to write one.
            </p>
          ) : (
            comments.map((comment) => (
              <Comment key={comment._id} comment={comment} postId={postId} />
            ))
          )}
        </>
      )}
    </div>
  );
};

export default Comments;
