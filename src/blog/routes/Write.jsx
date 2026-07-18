// Placeholder — the react-quill-new editor + create-post mutation land in slice 10.
import { useUser } from "@clerk/clerk-react";
import { useIsAdmin } from "../lib/useIsAdmin";

const Write = () => {
  const { isLoaded, isSignedIn } = useUser();
  const isAdmin = useIsAdmin();

  if (!isLoaded) return <div className="py-24 text-center text-gray-500">Loading…</div>;
  if (!isSignedIn) return <div className="py-24 text-center text-gray-500">Sign in to write a post.</div>;
  if (!isAdmin) return <div className="py-24 text-center text-gray-500">Admins only.</div>;

  return <div className="py-24 text-center text-gray-500">Write page — coming in a later slice.</div>;
};

export default Write;
