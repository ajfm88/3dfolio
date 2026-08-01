import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { DEFAULT_HERO_TAGLINE } from "../constants/hero";

// The hero tagline is a single line of copy, not a list, so it lives in one
// document at a fixed id instead of being added to a collection. That keeps
// saving idempotent — there is no way to end up with two competing hero
// documents — while still sitting inside a collection, which is what the public
// REST read lists.
const COLLECTION = "hero";
const DOC_ID = "main";

// Falls back to the shipped copy when the document does not exist yet, which is
// what makes the first save a seed: the editor opens already holding the text the
// site is currently showing, and saving writes it back as the stored version.
//
// `stored` is reported separately rather than left for the caller to infer from
// the text. Inferring it by comparing against DEFAULT_HERO_TAGLINE would read as
// unchanged in exactly the state where a save is most needed — nothing written
// yet — and disable the only control that can create the document.
export async function loadHero() {
  const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
  const tagline = snap.exists() ? snap.data()?.tagline : undefined;
  const stored = typeof tagline === "string" && tagline.trim() !== "";
  return { tagline: stored ? tagline : DEFAULT_HERO_TAGLINE, stored };
}

export function saveHero(tagline) {
  return setDoc(doc(db, COLLECTION, DOC_ID), {
    tagline: String(tagline ?? "").trim(),
  });
}
