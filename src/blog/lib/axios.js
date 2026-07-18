import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// <ClerkProvider> exposes a global `window.Clerk` once it mounts, so a plain
// module-level interceptor can attach the session token without needing a
// React hook (useAuth() only works inside components under the provider).
// Public GET requests just skip the header when there's no session — the
// backend already treats missing auth as anonymous.
api.interceptors.request.use(async (config) => {
  const token = await window.Clerk?.session?.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
