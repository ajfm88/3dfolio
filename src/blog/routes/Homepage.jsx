// Placeholder — PostList, FeaturedPosts, and MainCategories land in slice 11/12.
// The API status line is what slice 7 used to prove the axios+Clerk plumbing
// worked; kept here since it's still a useful live signal during the build-out.
import { useEffect, useState } from "react";
import { api } from "../lib/axios";

const Homepage = () => {
  const [status, setStatus] = useState("Loading posts from the API…");

  useEffect(() => {
    api
      .get("/posts")
      .then((res) => setStatus(`API reachable — ${res.data.posts.length} post(s) so far.`))
      .catch((err) => setStatus(`API error: ${err.message}`));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-3xl font-bold">Blog</h1>
      <p className="text-gray-500">Coming soon.</p>
      <p className="text-xs text-gray-400">{status}</p>
    </div>
  );
};

export default Homepage;
