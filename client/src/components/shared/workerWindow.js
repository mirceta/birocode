// The ONE reused worker window (board task afed9d6d): the management surface (M)
// jumps to any machine's harness in a single shared window (W) instead of piling
// up tabs. The whole mechanism is the browser's own named-target rule:
// window.open(url, FIXED_NAME) REUSES the auxiliary browsing context this page
// opened under that name and NAVIGATES it — cross-origin included — rather than
// opening a new one. Verified against real Chromium/Edge in
// .claudeweb-preview/playwright/check-worker-window.mjs (4/4: reuse, cross-origin
// renavigation, and the association even survives a reload of M).
//
// Known limits, by design of the platform:
//  - the name association is scoped to the opener's tab — a second management tab
//    gets its own worker window (still one worker PER management window);
//  - focus() is best-effort: the browser navigates the worker reliably, but may
//    decline to raise a background OS window without its own user gesture.
// Must be called from a click handler (user gesture) or the popup blocker wins.

export const WORKER_WINDOW_NAME = 'birocode-worker';

/** Opens/renavigates the shared worker window to `url`; true when the browser
 * gave us a handle (false = popup blocked / no url). */
export function openInWorker(url) {
  if (!url) return false;
  const w = window.open(url, WORKER_WINDOW_NAME);
  if (!w) return false;
  try { w.focus(); } catch { /* cross-origin handle: focus is allowed, but never guaranteed to raise */ }
  return true;
}
