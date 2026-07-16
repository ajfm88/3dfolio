import { getAuth } from "@clerk/express";

// Resolve the caller's role from two sources, most-authoritative first:
//   1. the Clerk session claim (public_metadata.role, surfaced on the session
//      token) — the source of truth, changeable from the Clerk dashboard;
//   2. the webhook-mirrored role on the synced Mongo user (req.user.role) — a
//      fallback so admin gating still holds even if the Clerk JWT template
//      isn't configured to embed public metadata in the session token.
// Relying on the fallback requires protectRoute to have populated req.user first.
export function resolveRole(req) {
  const claimRole = getAuth(req)?.sessionClaims?.metadata?.role;
  return claimRole || req.user?.role || "user";
}
