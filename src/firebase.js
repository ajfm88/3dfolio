import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Web config is not secret (it's shipped to every client), but we keep it in
// env vars so the same code runs against different Firebase projects and so the
// values live in one place (.env locally, Vercel project settings in prod).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// Always let the user pick which Google account to use (handy when a wrong
// account is cached and needs to be swapped for the admin one).
googleProvider.setCustomParameters({ prompt: "select_account" });

// The single account allowed to edit content. This is only a UX gate — the real
// enforcement lives in firestore.rules / storage.rules, which cannot be bypassed
// from the client.
export const ADMIN_EMAIL = "ale@ajfm88.com";
