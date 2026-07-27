import { useSyncExternalStore } from "react";

// The height of the *visual* viewport — the part of the page not covered by the
// on-screen keyboard. `100dvh` tracks collapsing browser chrome but not the
// keyboard, so on iOS Safari a focused composer ends up behind it. Callers use
// this to pin the chat shell to the space actually visible, falling back to the
// dvh class when the API is missing (older Safari, some Android browsers).
const subscribe = (onChange) => {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  viewport.addEventListener("resize", onChange);
  return () => viewport.removeEventListener("resize", onChange);
};

const getSnapshot = () => window.visualViewport?.height ?? null;

export default function useVisualViewportHeight() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
