import { Link } from "react-router-dom";
import { format } from "timeago.js";
import Image from "./Image";

// A single post card for the homepage/list views: cover image, title, author
// and category links, a relative timestamp, and a "Read More" link. All links
// are /blog-prefixed since the blog mounts as a nested route rather than at the
// domain root. The category link points at the filtered post list
// (/blog/posts?cat=…) so `to` is always defined (react-router v6 requires it).
const PostListItem = ({ post }) => {
  return (
    <div className="flex flex-col xl:flex-row gap-8 mb-12">
      {/* image */}
      {post.img && (
        <div className="md:hidden xl:block xl:w-1/3">
          <Image src={post.img} className="rounded-2xl object-cover" w="735" />
        </div>
      )}
      {/* details */}
      <div className="flex flex-col gap-4 xl:w-2/3">
        <Link to={`/blog/${post.slug}`} className="text-4xl font-semibold">
          {post.title}
        </Link>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span>Written by</span>
          <Link
            className="text-blue-800"
            to={`/blog/posts?author=${post.user.username}`}
          >
            {post.user.username}
          </Link>
          <span>on</span>
          <Link
            className="text-blue-800"
            to={`/blog/posts?cat=${post.category}`}
          >
            {post.category}
          </Link>
          <span>{format(post.createdAt)}</span>
        </div>
        <p>{post.desc}</p>
        <Link
          to={`/blog/${post.slug}`}
          className="underline text-blue-800 text-sm"
        >
          Read More
        </Link>
      </div>
    </div>
  );
};

export default PostListItem;
