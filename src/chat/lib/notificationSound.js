// The incoming-message chime. It is synthesized with the Web Audio API instead
// of shipped as an audio file: two short sine notes are a few lines of code and
// keep another binary out of the bundle, unlike the keystroke clicks, which are
// recorded samples that would be tedious to fake.

const NOTES = [
  // [frequency (A5, then D6), delay from the start of the chime]
  [880, 0],
  [1174.66, 0.09],
];

const ATTACK = 0.01;
const RELEASE = 0.22;
const PEAK_GAIN = 0.12;

let audioContext = null;

// Built lazily for the same reason as the keystroke pool, plus one of its own:
// a context created before any user interaction starts out suspended, so
// deferring construction until the first chime keeps it usable.
function getAudioContext() {
  if (audioContext) return audioContext;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  return audioContext;
}

export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;

  NOTES.forEach(([frequency, offset]) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = now + offset;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    // A raw oscillator would click on start and stop, so each note gets a fast
    // fade in and an exponential tail.
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + RELEASE);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(startAt);
    oscillator.stop(startAt + RELEASE + 0.02);
  });
}
