// socket.io does not catch exceptions thrown inside event handlers: one that
// escapes takes down the whole Node process, and this process also serves
// /blog. Every handler in every socket module is wrapped here so a malformed
// payload can only kill its own event. Declared async so a rejected promise is
// caught too, not just a synchronous throw. workspace:join acknowledges, and
// that handler answers the caller itself; an error that escapes this wrapper
// is only logged, so the acknowledgement would never arrive.
export function safeHandler(event, handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(`Error in socket handler (${event}):`, error.message);
    }
  };
}
