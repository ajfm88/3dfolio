import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage } from "../firebase";

const COLLECTION = "experiences";

// The shape of a single experience document (kept in sync with firestore.rules and
// the mapper in Experience.jsx). `order` is ascending and drives timeline order.
export function emptyExperience(order = 0) {
  return {
    title: "",
    company_name: "",
    company_url: "",
    iconUrl: "",
    iconBg: "#383E56",
    date: "",
    points: [""],
    order,
  };
}

// Strip the local-only `id` before writing, and coerce fields to their stored types.
function toDoc(data) {
  return {
    title: data.title ?? "",
    company_name: data.company_name ?? "",
    company_url: data.company_url ?? "",
    iconUrl: data.iconUrl ?? "",
    iconBg: data.iconBg ?? "#383E56",
    date: data.date ?? "",
    points: (data.points ?? []).map((p) => p ?? "").filter((p) => p.trim() !== ""),
    order: Number(data.order ?? 0),
  };
}

export async function listExperiences() {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createExperience(data) {
  const refDoc = await addDoc(collection(db, COLLECTION), toDoc(data));
  return refDoc.id;
}

export function updateExperience(id, data) {
  return updateDoc(doc(db, COLLECTION, id), toDoc(data));
}

export function removeExperience(id) {
  return deleteDoc(doc(db, COLLECTION, id));
}

// Uploads a logo file to Storage and returns its public download URL.
export async function uploadIcon(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageRef = ref(storage, `experience-icons/${Date.now()}-${safeName}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Swaps the `order` value of the item at `index` with its neighbour in `direction`
// (-1 = up, +1 = down). No-op at the ends. `list` is the current ordered array.
export async function moveExperience(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const a = list[index];
  const b = list[target];
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, a.id), { order: b.order });
  batch.update(doc(db, COLLECTION, b.id), { order: a.order });
  await batch.commit();
}
