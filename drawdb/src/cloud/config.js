// 3dfolio-owned: build-time switches for cloud accounts and storage.
// 3dfolio: cloud accounts are on only when both variables are set at build time.
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
export const API_URL = import.meta.env.VITE_API_URL ?? "";
export const CLOUD_CONFIGURED = Boolean(CLERK_PUBLISHABLE_KEY && API_URL);
