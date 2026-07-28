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

const COLLECTION = "projects";

export const TAG_COLOR_PRESETS = [
  { label: "Black", value: "black-gradient" },
  { label: "Blue", value: "blue-text-gradient" },
  { label: "Green", value: "green-text-gradient" },
  { label: "Orange", value: "orange-text-gradient" },
  { label: "Pink", value: "pink-text-gradient" },
];

// The shape of a single project document (kept in sync with firestore.rules and
// the mapper in Works.jsx). `order` is ascending and drives display order.
export function emptyProject(order = 0) {
  return {
    name: "",
    description: "",
    tags: [{ name: "", color: TAG_COLOR_PRESETS[0].value }],
    url: "",
    imageUrl: "",
    source_code_link: "",
    order,
  };
}

// Strip the local-only `id` before writing, and coerce fields to their stored types.
function toDoc(data) {
  return {
    name: data.name ?? "",
    description: data.description ?? "",
    tags: (data.tags ?? [])
      .map((t) => ({ name: (t.name ?? "").trim(), color: t.color ?? TAG_COLOR_PRESETS[0].value }))
      .filter((t) => t.name !== ""),
    url: data.url ?? "",
    imageUrl: data.imageUrl ?? "",
    source_code_link: data.source_code_link ?? "",
    order: Number(data.order ?? 0),
  };
}

export async function listProjects() {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createProject(data) {
  const refDoc = await addDoc(collection(db, COLLECTION), toDoc(data));
  return refDoc.id;
}

export function updateProject(id, data) {
  return updateDoc(doc(db, COLLECTION, id), toDoc(data));
}

export function removeProject(id) {
  return deleteDoc(doc(db, COLLECTION, id));
}

// Uploads a project image to Storage and returns its public download URL.
export async function uploadProjectImage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageRef = ref(storage, `project-images/${Date.now()}-${safeName}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// Swaps the `order` value of the item at `index` with its neighbour in `direction`
// (-1 = up, +1 = down). No-op at the ends. `list` is the current ordered array.
export async function moveProject(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const a = list[index];
  const b = list[target];
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION, a.id), { order: b.order });
  batch.update(doc(db, COLLECTION, b.id), { order: a.order });
  await batch.commit();
}
