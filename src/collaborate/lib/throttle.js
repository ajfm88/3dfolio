export function throttle(fn, wait, clock = defaultClock) {
  let timerId = null;
  let lastArgs = null;
  let lastCallTime = 0;

  function invoke() {
    const args = lastArgs;
    lastArgs = null;
    timerId = null;
    fn(...args);
  }

  const throttled = (...args) => {
    const now = clock.now();
    lastArgs = args;

    if (!timerId) {
      const timeSinceLastCall = now - lastCallTime;
      if (timeSinceLastCall >= wait) {
        lastCallTime = now;
        fn(...args);
        return;
      }
      const delay = wait - timeSinceLastCall;
      timerId = clock.setTimeout(invoke, delay);
    }
  };

  throttled.cancel = () => {
    if (timerId !== null) {
      clock.clearTimeout(timerId);
      timerId = null;
      lastArgs = null;
    }
  };

  return throttled;
}

const defaultClock = {
  now: () => Date.now(),
  setTimeout: (fn, delay) => setTimeout(fn, delay),
  clearTimeout: (id) => clearTimeout(id),
};