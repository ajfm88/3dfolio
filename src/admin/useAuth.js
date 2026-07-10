import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

import { auth, googleProvider, ADMIN_EMAIL } from "../firebase";

// Central auth hook for the admin area. Wraps Firebase Google sign-in and exposes
// a simple { user, isAdmin, loading, login, logout } contract that the UI gates on.
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setLoading(false);
  }), []);

  // Client-side gate only — see firestore.rules / storage.rules for the real check.
  const isAdmin = !!user && user.email === ADMIN_EMAIL && user.emailVerified;

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  return { user, isAdmin, loading, login, logout };
}
