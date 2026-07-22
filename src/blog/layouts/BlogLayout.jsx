import { Outlet } from "react-router-dom";
import BlogNavbar from "../components/BlogNavbar";

// The blog's page frame.
//
// `colorScheme: light` stops the portfolio's global `color-scheme: dark`
// (src/index.css) from bleeding into native form control / scrollbar rendering
// inside this light-themed subtree.
//
// The tinted background is load-bearing, not decoration: the blog's surfaces —
// the category bar, the Write form's inputs, comment cards — are white or
// near-white with a soft shadow, so they only read as raised cards against a
// tinted page. On a white background they dissolve into it.
//
// `blog-root` is the scope hook for blog.css.
const BlogLayout = () => {
  return (
    <div
      className="blog-root min-h-screen bg-[#e6e6ff] text-gray-900 px-4 md:px-8 lg:px-16 xl:px-32 2xl:px-64"
      style={{ colorScheme: "light" }}
    >
      <BlogNavbar />
      <Outlet />
    </div>
  );
};

export default BlogLayout;
