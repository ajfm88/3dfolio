const OBJECT_ID = /^[0-9a-f]{24}$/i;
const ROLES = new Set(["owner", "editor", "viewer"]);

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

// Join acks and presence events share this gate. One bad row rejects the
// whole list so a partial roster cannot replace the people already on screen.
export function normalizeParticipants(raw) {
  if (!Array.isArray(raw)) return null;

  const seen = new Set();
  const participants = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    if (typeof entry.userId !== "string" || !OBJECT_ID.test(entry.userId)) return null;
    if (typeof entry.fullName !== "string" || typeof entry.img !== "string") return null;
    if (!ROLES.has(entry.role)) return null;
    const userId = entry.userId.toLowerCase();
    if (seen.has(userId)) return null;
    seen.add(userId);
    participants.push({
      userId,
      fullName: entry.fullName,
      img: entry.img,
      role: entry.role,
    });
  }

  participants.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  return participants;
}
