// Route root for chat: the scoped provider, the auth/socket bootstrap, the theme
// scope, and the signed-in/signed-out gate. Like the blog, everything imported
// from here — Clerk, zustand, socket.io-client, toastify, chat.css — is confined
// to the lazy /chat chunk and never reaches the main portfolio bundle. Chat rides
// the same shared Express backend as the blog (Clerk + Mongo + ImageKit +
// Socket.io on Render).
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../chat/chat.css";

import ChatAuthGate from "../chat/routes/ChatAuthGate";
import ChatPage from "../chat/routes/ChatPage";
import { useAuthStore } from "../chat/store/useAuthStore";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

// While Clerk resolves the session, show a quiet placeholder rather than
// flashing the signed-out gate at an already-signed-in user.
const ChatLoader = () => (
  <div className="flex min-h-[100dvh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--chat-border-strong)] border-t-[var(--chat-accent-2)]" />
  </div>
);

// Sits under <ClerkProvider> so it can read the Clerk session: on sign-in it
// syncs the Mongo user and opens the socket; on sign-out it tears both down.
// The gate keeps the whole /chat experience behind authentication.
const ChatApp = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) checkAuth();
    else clearAuth();
  }, [isLoaded, isSignedIn, checkAuth, clearAuth]);

  return (
    <div className="chat-root min-h-[100dvh]">
      {!isLoaded ? (
        <ChatLoader />
      ) : (
        <Routes>
          <Route index element={isSignedIn ? <ChatPage /> : <ChatAuthGate />} />
        </Routes>
      )}
    </div>
  );
};

const Chat = () => (
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <ChatApp />
    <ToastContainer position="bottom-right" />
  </ClerkProvider>
);

export default Chat;
