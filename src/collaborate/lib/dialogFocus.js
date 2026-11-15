// One selector so the dialog trap and the restore path cannot disagree about
// what is allowed to take focus.
export const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

function isDisabled(element) {
  return typeof element?.matches === "function" && element.matches(":disabled");
}

function firstMatch(panel, selector, accept) {
  if (!panel || typeof panel.querySelectorAll !== "function") return null;
  for (const element of panel.querySelectorAll(selector)) {
    if (accept(element)) return element;
  }
  return null;
}

// After a failed submit the panel still holds focus. Put it back on the
// control the user was using, then on the field the dialog marked, then on
// the first control that can still be tabbed to.
export function restoreTarget(panel, lastFocused) {
  if (
    lastFocused
    && lastFocused !== panel
    && typeof panel?.contains === "function"
    && panel.contains(lastFocused)
    && lastFocused.isConnected === true
    && !isDisabled(lastFocused)
  ) return lastFocused;

  const autofocus = firstMatch(
    panel,
    "[data-autofocus], [autofocus]",
    (element) => !isDisabled(element),
  );
  if (autofocus) return autofocus;

  const focusable = firstMatch(
    panel,
    FOCUSABLE,
    (element) => !isDisabled(element) && element.tabIndex >= 0,
  );
  if (focusable) return focusable;

  return panel;
}
