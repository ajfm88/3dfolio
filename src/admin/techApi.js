import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage } from "../firebase";
import { mergeTechFaces } from "../constants/tech";

// The cube is one object with a fixed six sides, so it lives in one document at a
// fixed id rather than as six documents in a collection. That makes a save atomic:
// there is no window in which a reader could catch four new faces and two old ones,
// and no way to end up with a cube missing a side.
const COLLECTION = "tech";
const DOC_ID = "main";

// `stored` is reported separately rather than left for the caller to work out from
// the faces. Before the first write the editor holds the shipped cube, which is
// indistinguishable from a saved copy of the shipped cube, so inferring it would
// disable the only control that can create the document.
export async function loadTech() {
  const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
  const faces = snap.exists() ? snap.data()?.faces : undefined;
  const stored = Array.isArray(faces) && faces.length > 0;
  return { faces: mergeTechFaces(stored ? faces : []), stored };
}

// `src` is deliberately dropped here: it is a bundled asset URL that Vite fingerprints
// at build time, so storing it would break on the next deploy. An empty `imageUrl` is
// what records that a face is still on its shipped image.
export function saveTech(faces) {
  return setDoc(doc(db, COLLECTION, DOC_ID), {
    faces: (faces ?? []).map((face) => ({
      label: String(face?.label ?? "").trim(),
      imageUrl: String(face?.imageUrl ?? "").trim(),
      rotation: Number(face?.rotation ?? 0),
    })),
  });
}

// Uploads a face image to Storage and returns its public download URL.
export async function uploadTechIcon(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageRef = ref(storage, `tech-icons/${Date.now()}-${safeName}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
