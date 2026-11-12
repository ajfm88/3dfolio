// A short incoming-message chime. Copied from the turn chime's guarded Web
// Audio path so a missing or throwing context cannot break message delivery.
// This module keeps its own AudioContext: a failure here does not silence the
// turn-granted chime, and the reverse is also true.

const NOTES = [
  [880, 0],
  [1174.66, 0.09],
];

const ATTACK = 0.01;
const RELEASE = 0.22;
const PEAK_GAIN = 0.12;

let audioContext = null;

function getAudioContext() {
  if (audioContext) return audioContext;
  try {
    const root = globalThis.window;
    if (!root) return null;
    const AudioContextCtor = root.AudioContext || root.webkitAudioContext;
    if (typeof AudioContextCtor !== "function") return null;
    const created = new AudioContextCtor();
    audioContext = created;
    return created;
  } catch {
    return null;
  }
}

export function playProjectMessageSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      try {
        const pending = ctx.resume();
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
      } catch {
        // A resume that throws is the same as a silent chime.
      }
    }

    const now = ctx.currentTime;
    for (const [frequency, offset] of NOTES) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = now + offset;

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + ATTACK);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + RELEASE);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + RELEASE + 0.02);
    }
  } catch {
    // The message is already delivered. Sound is optional.
  }
}
