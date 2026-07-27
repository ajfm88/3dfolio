import { useCallback } from "react";

const KEYSTROKE_COUNT = 4;

let pool = null;

// The four <audio> elements are built on first use rather than at module scope,
// so nothing is downloaded for a visitor who keeps sounds off or never types —
// importing this hook alone costs no requests.
function getPool() {
  if (pool) return pool;

  pool = Array.from({ length: KEYSTROKE_COUNT }, (_, i) => {
    const audio = new Audio(`/sounds/keystroke${i + 1}.mp3`);
    audio.volume = 0.35;
    return audio;
  });

  return pool;
}

// Plays a random keystroke click as you type. Callers gate this on the store's
// isSoundEnabled preference; the hook itself makes no policy decision.
export default function useKeyboardSound() {
  const playRandomKeyStrokeSound = useCallback(() => {
    const sounds = getPool();
    const sound = sounds[Math.floor(Math.random() * sounds.length)];

    // Rewinding lets a fast typist retrigger the same clip mid-playback.
    sound.currentTime = 0;
    // Autoplay policies reject until the page has been interacted with; a
    // silent keystroke is the right outcome, so the rejection is swallowed.
    sound.play().catch(() => {});
  }, []);

  return { playRandomKeyStrokeSound };
}
