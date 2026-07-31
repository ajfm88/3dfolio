import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { DEFAULT_ABOUT } from "../constants/about";

// About is a single block of copy, not a list, so it lives in one document at a
// fixed id instead of being added to a collection. That keeps saving idempotent —
// there is no way to end up with two competing About documents — while still
// sitting inside a collection, which is what the public REST read lists.
const COLLECTION = "about";
const DOC_ID = "main";

// Falls back to the shipped copy when the document does not exist yet, which is
// what makes the first save a seed: the editor opens already holding the text the
// site is currently showing, and saving writes it back as the stored version.
//
// `stored` is reported separately rather than left for the caller to infer from
// the text. Inferring it by comparing against DEFAULT_ABOUT would read as
// unchanged in exactly the state where a save is most needed — nothing written
// yet — and disable the only control that can create the document.
export async function loadAbout() {
  const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
  const body = snap.exists() ? snap.data()?.body : undefined;
  const stored = typeof body === "string" && body.trim() !== "";
  return { body: stored ? body : DEFAULT_ABOUT, stored };
}

export function saveAbout(body) {
  return setDoc(doc(db, COLLECTION, DOC_ID), { body: String(body ?? "").trim() });
}
