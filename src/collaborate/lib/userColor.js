const CURSOR_PALETTE = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#F7DC6F",
  "#85C1E9",
];

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Hash: start at 0; per character hash = (hash * 31 + charCode) >>> 0 over the
// lowercased 24-hex id; color = palette[hash % 8]. Invalid ids use palette[0].
function hashUserId(userId) {
  if (typeof userId !== "string" || !OBJECT_ID.test(userId)) return 0;
  const id = userId.toLowerCase();
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash * 31) + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function userColor(userId) {
  const index = hashUserId(userId) % CURSOR_PALETTE.length;
  return CURSOR_PALETTE[index];
}