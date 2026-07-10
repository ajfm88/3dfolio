// Reads a *public* Firestore collection over the plain REST API, so the public
// portfolio bundle never has to ship the Firebase SDK. The collection's security
// rules must allow public read. Used by the data-driven sections (Experience today,
// About/Tech/Projects/Contact later).
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;

// Firestore REST returns typed fields ({ stringValue: "…" }); unwrap to plain JS.
function unwrap(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("booleanValue" in field) return field.booleanValue;
  if ("nullValue" in field) return null;
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(unwrap);
  if ("mapValue" in field) return unwrapFields(field.mapValue.fields);
  return undefined;
}

function unwrapFields(fields = {}) {
  const out = {};
  for (const key of Object.keys(fields)) out[key] = unwrap(fields[key]);
  return out;
}

export async function fetchCollection(name) {
  if (!PROJECT_ID) return [];
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${name}?pageSize=300`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
  const data = await res.json();
  return (data.documents || []).map((doc) => ({
    id: doc.name.split("/").pop(),
    ...unwrapFields(doc.fields),
  }));
}
