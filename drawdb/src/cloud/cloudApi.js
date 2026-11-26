// 3dfolio-owned: axios client for the /api/diagrams routes, sends the Clerk session as a Bearer token.
import axios from "axios";

export function createCloudApi({ baseUrl, getToken }) {
  const http = axios.create({ baseURL: baseUrl });

  http.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  http.interceptors.response.use(
    (response) => response,
    (error) => {
      const message = error?.response?.data?.message;
      if (typeof message === "string" && message) error.message = message;
      return Promise.reject(error);
    },
  );

  const path = (id) => `/diagrams/${encodeURIComponent(id)}`;

  return {
    list: async () => (await http.get("/diagrams")).data,
    get: async (id) => (await http.get(path(id))).data,
    create: async (body) => (await http.post("/diagrams", body)).data,
    update: async (id, body) => (await http.put(path(id), body)).data,
    remove: async (id) => {
      await http.delete(path(id));
    },
  };
}
