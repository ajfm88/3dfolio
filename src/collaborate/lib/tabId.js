const STORAGE_KEY = "collab:tabId";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// One id per page load. A storage failure falls back to memory and must not
// mint a different id on the next reconnect.
let cached = null;

export function getTabId() {
  if (cached) return cached;

  const generated = globalThis.crypto.randomUUID();
  let stored = null;
  try {
    stored = globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    stored = null;
  }

  const reusable = typeof stored === "string" && UUID_V4.test(stored) ? stored.toLowerCase() : null;
  cached = reusable ?? generated;

  if (!reusable) {
    try {
      globalThis.sessionStorage?.setItem(STORAGE_KEY, cached);
    } catch {
      // The in-memory id is already cached for this page.
    }
  }

  return cached;
}
