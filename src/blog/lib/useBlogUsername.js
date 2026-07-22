import { useUser } from "@clerk/clerk-react";

// The handle the API stores against a user's posts and comments, derived on the
// client exactly the way the Clerk webhook derives it server-side:
// `u.username || email.split("@")[0]` (server/src/webhooks/clerk.webhook.js).
//
// Worth the indirection because Clerk only populates `user.username` when
// usernames are enabled as a sign-in identifier, and this app signs in with
// email + Google — so `user.username` is null for every account here. Comparing a
// stored author handle straight against it would compare against null, never
// match, and hide "delete your own comment" from the person who wrote it.
// Returns null when signed out.
export const useBlogUsername = () => {
  const { user } = useUser();

  if (!user) return null;

  return (
    user.username ||
    user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    null
  );
};
