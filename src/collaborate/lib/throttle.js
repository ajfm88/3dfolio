export function throttle(fn, wait, clock = defaultClock) {
  let timerId = null;
  let lastArgs = null;
  let lastCallTime = 0;
  let hasInvoked = false;

  function invoke() {
    const args = lastArgs;
    lastArgs = null;
    timerId = null;
    lastCallTime = clock.now();
    hasInvoked = true;
    fn(...args);
  }

  const throttled = (...args) => {
    const now = clock.now();
    lastArgs = args;

    if (timerId === null) {
      const timeSinceLastCall = hasInvoked ? now - lastCallTime : Infinity;
      if (timeSinceLastCall >= wait) {
        lastCallTime = now;
        hasInvoked = true;
        lastArgs = null;
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