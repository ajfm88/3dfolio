// Route root for the blog. Providers + the nested route shell live here;
// BlogLayout (light theme, scoped so it doesn't inherit the portfolio's dark
// color-scheme) + individual pages fill in over the next several slices.
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import BlogLayout from "../blog/layouts/BlogLayout";
import Homepage from "../blog/routes/Homepage";
import PostListPage from "../blog/routes/PostListPage";
import SinglePostPage from "../blog/routes/SinglePostPage";
import Write from "../blog/routes/Write";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const queryClient = new QueryClient();

const Blog = () => (
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route element={<BlogLayout />}>
          <Route index element={<Homepage />} />
          <Route path="posts" element={<PostListPage />} />
          <Route path="write" element={<Write />} />
          <Route path=":slug" element={<SinglePostPage />} />
        </Route>
      </Routes>
      <ToastContainer position="bottom-right" />
    </QueryClientProvider>
  </ClerkProvider>
);

export default Blog;
