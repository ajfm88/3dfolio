import { useState } from "react";
import PostList from "../components/PostList";
import SideMenu from "../components/SideMenu";

// The /blog/posts browse page: the paginated PostList next to a SideMenu of
// search / sort / category filters. On mobile the sidebar collapses behind a
// toggle; from md+ it's always shown. All filtering flows through the URL search
// params PostList reads, so every filtered view is a shareable link.
const PostListPage = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <h1 className="mb-8 text-2xl">Development Blog</h1>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="bg-blue-800 text-sm text-white px-4 py-2 rounded-2xl mb-4 md:hidden"
      >
        {open ? "Close" : "Filter or Search"}
      </button>
      <div className="flex flex-col-reverse gap-8 md:flex-row justify-between">
        <div className="">
          <PostList />
        </div>
        <div className={`${open ? "block" : "hidden"} md:block`}>
          <SideMenu />
        </div>
      </div>
    </div>
  );
};

export default PostListPage;
