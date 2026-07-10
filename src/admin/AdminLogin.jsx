import { useState } from "react";
import { LogIn, ShieldAlert } from "lucide-react";

import { ADMIN_EMAIL } from "../firebase";

// Google's "G" mark as an inline SVG so we don't pull in an icon asset.
const GoogleMark = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.6 5.6C41.9 36.8 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"
    />
  </svg>
);

const AdminLogin = ({ user, login, logout }) => {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setError("");
    setBusy(true);
    try {
      await login();
    } catch (err) {
      // A closed popup is a normal user action, not an error worth showing.
      if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
        setError(err?.message || "Sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  // Logged in, but with the wrong Google account.
  const wrongAccount = !!user;

  return (
    <div className="min-h-screen bg-primary text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-2xl p-8 shadow-2xl text-center">
        <h1 className="text-2xl font-bold">ajfm88 admin</h1>
        <p className="mt-2 text-sm text-secondary">Content management for ajfm88.com</p>

        {wrongAccount ? (
          <>
            <div className="mt-6 flex flex-col items-center gap-3 text-amber-300">
              <ShieldAlert size={40} />
              <p className="text-sm text-gray-200">
                <span className="font-semibold">{user.email}</span> is not authorized.
                <br />
                Only <span className="font-semibold">{ADMIN_EMAIL}</span> can edit content.
              </p>
            </div>
            <button
              onClick={logout}
              className="mt-6 w-full rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors py-3 font-medium"
            >
              Sign out and try another account
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleLogin}
              disabled={busy}
              className="mt-8 w-full inline-flex items-center justify-center gap-3 rounded-lg bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-60 transition-colors py-3 font-medium"
            >
              {busy ? (
                <LogIn size={20} className="animate-pulse" />
              ) : (
                <GoogleMark />
              )}
              {busy ? "Signing in…" : "Sign in with Google"}
            </button>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
