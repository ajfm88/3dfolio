import { Outlet } from "react-router-dom";
import BlogNavbar from "../components/BlogNavbar";

// `colorScheme: light` stops the portfolio's global `color-scheme: dark`
// (src/index.css) from bleeding into native form control / scrollbar
// rendering inside this light-themed subtree.
const BlogLayout = () => {
  return (
    <div
      className="min-h-screen bg-white text-gray-900 px-4 md:px-8 lg:px-16 xl:px-32 2xl:px-64"
      style={{ colorScheme: "light" }}
    >
      <BlogNavbar />
      <Outlet />
    </div>
  );
};

export default BlogLayout;
