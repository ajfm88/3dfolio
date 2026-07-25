export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
}
