import axios from "axios";

// Collaborate's own instance stays inside the lazy route. Vercel and Render
// are different origins, so the Clerk session travels as a Bearer token.
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// ClerkProvider exposes the session on window.Clerk. Every project route is
// behind protectRoute, so authenticated requests need this header.
axiosInstance.interceptors.request.use(async (config) => {
  const token = await window.Clerk?.session?.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
