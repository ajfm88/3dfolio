import axios from "axios";

// Chat's own axios instance, isolated inside the lazy /chat chunk. Same
// cross-origin auth strategy as the blog: Vercel → Render is cross-origin, so a
// session cookie can't ride along; instead a request interceptor attaches the
// Clerk session token as a Bearer header.
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// <ClerkProvider> exposes a global `window.Clerk` once it mounts, so a
// module-level interceptor can read the session token without a React hook.
// Every chat request is authenticated (the API's protectRoute rejects anon
// requests), so this header is required, not optional as it is on the blog's
// public reads.
axiosInstance.interceptors.request.use(async (config) => {
  const token = await window.Clerk?.session?.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
