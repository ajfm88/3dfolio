import { useAuth } from "@clerk/clerk-react";

// Mirrors the backend's `resolveRole` session-claim check (server/src/lib/roles.js).
// UI-only gating for showing/hiding admin controls — the API enforces admin
// access independently, so this is never security-load-bearing on its own.
export const useIsAdmin = () => {
  const { sessionClaims } = useAuth();
  return sessionClaims?.metadata?.role === "admin";
};
