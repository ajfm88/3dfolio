import { useSyncExternalStore } from "react";

// The height of the visual viewport, copied into collaborate so the workspace
// shell can sit above the phone keyboard. 100dvh does not shrink for that
// keyboard. Callers keep the dvh class as the fallback when the API is missing.
const subscribe = (onChange) => {
  const viewport = globalThis.window?.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener("resize", onChange);
  return () => viewport.removeEventListener("resize", onChange);
};

const getSnapshot = () => globalThis.window?.visualViewport?.height ?? null;

export default function useVisualViewportHeight() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
