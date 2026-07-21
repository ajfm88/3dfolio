import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "timeago.js";
import { api } from "../lib/axios";
import Image from "../components/Image";
import PostMenuActions from "../components/PostMenuActions";
import Search from "../components/Search";

// The single-post view: fetch one post by slug (GET /api/posts/:slug, which also
// bumps the server-side visit counter that powers Popular/Trending) and render
// the header, cover image, the author-written HTML body, an author box, the
// admin/owner actions, and a category + search sidebar. Fetches through the
// shared `api` instance and keys the query ["post", slug] so PostMenuActions'
// feature toggle can invalidate it. All links are /blog-prefixed for the nested
// route mount; author/category links point at the filtered post list so `to` is
// always defined. Comments land in a later slice.
const fetchPost = async (slug) => {
  const res = await api.get(`/posts/${slug}`);
  return res.data;
};

const SinglePostPage = () => {
  const { slug } = useParams();

  const { isPending, error, data } = useQuery({
    queryKey: ["post", slug],
    queryFn: () => fetchPost(slug),
  });

  if (isPending)
    return <p className="py-24 text-center text-gray-500">Loading…</p>;
  if (error)
    return (
      <p className="py-24 text-center text-red-500">
        Something went wrong! {error.message}
      </p>
    );
  if (!data)
    return <p className="py-24 text-center text-gray-500">Post not found.</p>;

  return (
    <div className="flex flex-col gap-8">
      {/* detail */}
      <div className="flex gap-8">
        <div className="lg:w-3/5 flex flex-col gap-8">
          <h1 className="text-xl md:text-3xl xl:text-4xl 2xl:text-5xl font-semibold">
            {data.title}
          </h1>
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span>Written by</span>
            <Link
              className="text-blue-800"
              to={`/blog/posts?author=${data.user.username}`}
            >
              {data.user.username}
            </Link>
            <span>on</span>
            <Link
              className="text-blue-800"
              to={`/blog/posts?cat=${data.category}`}
            >
              {data.category}
            </Link>
            <span>{format(data.createdAt)}</span>
          </div>
          {data.desc && (
            <p className="text-gray-500 font-medium">{data.desc}</p>
          )}
        </div>
        {data.img && (
          <div className="hidden lg:block w-2/5">
            <Image src={data.img} w="600" className="rounded-2xl" />
          </div>
        )}
      </div>
      {/* content */}
      <div className="flex flex-col md:flex-row gap-12 justify-between">
        {/* text — the body is admin-authored HTML from the editor, rendered
            directly. Only admins can create posts, so there is no untrusted
            input path into this markup. */}
        <div
          className="lg:text-lg flex flex-col gap-6 text-justify"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
        {/* menu */}
        <div className="px-4 h-max sticky top-8">
          <h1 className="mb-4 text-sm font-medium">Author</h1>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-8">
              {data.user.img && (
                <Image
                  src={data.user.img}
                  className="w-12 h-12 rounded-full object-cover"
                  w="48"
                  h="48"
                />
              )}
              <Link
                className="text-blue-800"
                to={`/blog/posts?author=${data.user.username}`}
              >
                {data.user.username}
              </Link>
            </div>
          </div>
          <PostMenuActions post={data} />
          <h1 className="mt-8 mb-4 text-sm font-medium">Categories</h1>
          <div className="flex flex-col gap-2 text-sm">
            <Link className="underline" to="/blog/posts">
              All
            </Link>
            <Link className="underline" to="/blog/posts?cat=web-design">
              Web Design
            </Link>
            <Link className="underline" to="/blog/posts?cat=development">
              Development
            </Link>
            <Link className="underline" to="/blog/posts?cat=databases">
              Databases
            </Link>
            <Link className="underline" to="/blog/posts?cat=seo">
              Search Engines
            </Link>
            <Link className="underline" to="/blog/posts?cat=marketing">
              Marketing
            </Link>
          </div>
          <h1 className="mt-8 mb-4 text-sm font-medium">Search</h1>
          <Search />
        </div>
      </div>
      {/* Comments (read + signed-in write + delete) land in a later slice. */}
    </div>
  );
};

export default SinglePostPage;
