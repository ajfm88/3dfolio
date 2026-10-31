import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Music, Square } from "lucide-react";

// The purple dot above the hero heading, which doubles as an easter egg: tap it
// three times for a nudge, five for another, and seven to start Tonny Espeset's
// Dittytoy port of a-ha's Take On Me. The dot looks and sits exactly as it always
// has — no pointer cursor, no focus ring — so the only way to find it is to poke.
const HINTS = { 3: "almost there...", 5: "just a few more clicks..." };
const CLICKS_TO_PLAY = 7;
const HINT_MS = 1600;

const DITTY_URL = "https://dittytoy.net/ditty/2dd99fc839";

// The player and the 97KB score are only fetched once someone is clearly poking
// at the dot, so neither ever touches the portfolio bundle. Loading starts at the
// first hint rather than the seventh click so the compile is finished by then:
// play() has to run inside that click for the browser to allow sound, and a
// compile in between would spend the click's user-activation window.
const loadPlayer = async () => {
  const [{ Dittytoy }, { default: code }] = await Promise.all([
    import("dittytoy"),
    import("../easterEgg/takeOnMe.ditty.js?raw"),
  ]);
  const player = new Dittytoy();
  await player.compile(code);
  return player;
};

const TakeOnMeDot = ({ className }) => {
  const [hint, setHint] = useState(null);
  // idle → loading (clicked seven times, player still compiling) → playing
  const [status, setStatus] = useState("idle");
  const clicks = useRef(0);
  const player = useRef(null);
  const hintTimer = useRef(null);

  // Leaving the portfolio (for /blog, /chat, …) unmounts the hero, and the song
  // has to stop with it rather than carry on with no chip left to stop it from.
  useEffect(
    () => () => {
      clearTimeout(hintTimer.current);
      player.current?.then((p) => p.stop()).catch(() => {});
    },
    [],
  );

  const showHint = (text) => {
    clearTimeout(hintTimer.current);
    setHint(text);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  };

  const reset = () => {
    clicks.current = 0;
    setStatus("idle");
  };

  const play = async () => {
    setStatus("loading");
    try {
      const p = await player.current;
      await p.play();
      setStatus("playing");
    } catch (err) {
      // A failed load is dropped so the next attempt fetches afresh.
      console.warn("Take On Me easter egg failed to play:", err);
      player.current = null;
      reset();
    }
  };

  const stop = () => {
    player.current?.then((p) => p.stop()).catch(() => {});
    reset();
  };

  const handleClick = () => {
    if (status !== "idle") return;
    clicks.current += 1;

    if (!player.current && clicks.current >= 3) player.current = loadPlayer();

    if (clicks.current >= CLICKS_TO_PLAY) {
      clearTimeout(hintTimer.current);
      setHint(null);
      play();
    } else if (HINTS[clicks.current]) {
      showHint(HINTS[clicks.current]);
    }
  };

  return (
    <div className="relative">
      <div
        className={`${className} select-none [touch-action:manipulation]`}
        onClick={handleClick}
      />

      <AnimatePresence>
        {hint && (
          <motion.span
            key={hint}
            className="absolute left-0 bottom-full mb-2 whitespace-nowrap rounded-full border border-[rgba(112,66,248,0.38)] bg-[rgba(3,0,20,0.75)] backdrop-blur-md px-3 py-1 text-[12px] sm:text-[13px] text-white-100 pointer-events-none"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {hint}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Portaled for the same reason the admin modals are: the hero content sits
          inside Framer Motion's transformed wrappers, and a transformed ancestor
          becomes the containing block for position: fixed, which would pin the
          chip to the hero instead of the viewport. */}
      {createPortal(
        <AnimatePresence>
          {status !== "idle" && (
            <motion.div
              className="fixed bottom-4 left-4 z-[60] flex items-center gap-3 rounded-full border border-[rgba(112,66,248,0.38)] bg-[rgba(3,0,20,0.8)] backdrop-blur-md pl-4 pr-2 py-2 shadow-lg shadow-[#2A0E61]/50 text-white"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25 }}
            >
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 text-[#915EFF] animate-spin shrink-0" />
              ) : (
                <Music className="w-4 h-4 text-[#915EFF] shrink-0" />
              )}
              <div className="leading-tight">
                <p className="text-[13px] font-semibold">
                  Take On Me <span className="text-secondary font-normal">— a-ha</span>
                </p>
                <a
                  href={DITTY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-secondary hover:text-[#915EFF] transition-colors duration-200"
                >
                  ditty by Tonny Espeset ↗
                </a>
              </div>
              <button
                type="button"
                onClick={stop}
                aria-label="Stop music"
                className="ml-1 flex items-center justify-center w-8 h-8 rounded-full bg-[rgba(112,66,248,0.25)] hover:bg-[rgba(112,66,248,0.5)] transition-colors duration-200"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default TakeOnMeDot;
