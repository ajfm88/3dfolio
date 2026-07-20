import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/axios";
import PostListItem from "./PostListItem";

// The paginated post list used by both the homepage "Recent Posts" and the
// filtered /blog/posts page. Notes:
//   1. Fetches through the shared `api` axios instance (src/blog/lib/axios.js)
//      so it rides the same Clerk bearer-token interceptor as every other blog
//      call (harmless for this public GET, but keeps one code path).
//   2. Pagination is driven by a client-side "Load More" button over
//      useInfiniteQuery rather than an infinite-scroll library — one fewer
//      dependency.
//   3. Reads searchParams (cat/author/search/sort) so the same component powers
//      the homepage list and the filtered /blog/posts page alike.
const fetchPosts = async (pageParam, searchParams) => {
  const searchParamsObj = Object.fromEntries([...searchParams]);
  const res = await api.get("/posts", {
    params: { page: pageParam, limit: 10, ...searchParamsObj },
  });
  return res.data;
};

const PostList = () => {
  const [searchParams] = useSearchParams();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["posts", searchParams.toString()],
    queryFn: ({ pageParam = 1 }) => fetchPosts(pageParam, searchParams),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length + 1 : undefined,
  });

  if (status === "pending") return <p className="text-gray-500">Loading...</p>;
  if (status === "error")
    return <p className="text-red-500">Something went wrong! {error.message}</p>;

  const allPosts = data?.pages?.flatMap((page) => page.posts) || [];

  if (allPosts.length === 0)
    return <p className="text-gray-500">No posts yet.</p>;

  return (
    <div className="flex flex-col">
      {allPosts.map((post) => (
        <PostListItem key={post._id} post={post} />
      ))}
      {hasNextPage ? (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-max mx-auto bg-blue-800 text-white rounded-xl px-4 py-2 disabled:bg-blue-400 disabled:cursor-not-allowed"
        >
          {isFetchingNextPage ? "Loading more..." : "Load More"}
        </button>
      ) : (
        <p className="text-center text-gray-400">
          <b>All posts loaded!</b>
        </p>
      )}
    </div>
  );
};

export default PostList;
