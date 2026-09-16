// The transcript render window (plans/chat-windowing.md; openspec arch-chat-window):
// ONE definition for every conversation surface. A long chat is slow because every
// turn mounts a heavy markdown bubble and we almost never scroll up, so only the
// recent TAIL is shown by default and a "Show earlier" button widens the window in
// chunks. The repo-agent chat (Chat.jsx) keeps the whole thread in state and slices
// it; the arch conversation (Arch.jsx) fetches only the window (`?tail=`) and asks
// for more — both read these numbers and this arithmetic, so they can never drift.
//
// Pure. Run: `npm --prefix client test`.

export const TRANSCRIPT_WINDOW = Object.freeze({
  /** Messages rendered by default: the most recent WINDOW of the thread. */
  WINDOW: 50,
  /** How many more each "Show earlier" reveals. */
  REVEAL_CHUNK: 50,
});

/**
 * Where the visible tail starts in a thread of `total` messages when `visibleCount`
 * are shown: `start` is the index of the first rendered message, `hidden` how many
 * older messages the "Show earlier" button stands for. Never negative.
 */
export function windowOf(total, visibleCount) {
  const t = Math.max(0, Number(total) || 0);
  const v = Math.max(0, Number(visibleCount) || 0);
  const start = Math.max(0, t - v);
  return { start, hidden: start };
}

/** The window after one "Show earlier": widened by REVEAL_CHUNK. */
export function widened(visibleCount) {
  return Math.max(0, Number(visibleCount) || 0) + TRANSCRIPT_WINDOW.REVEAL_CHUNK;
}

/** The `tail` a windowed fetch asks the server for: the visible count, never less than
 *  the default window (so a reset always re-fetches the full default tail). */
export function tailFor(visibleCount) {
  return Math.max(TRANSCRIPT_WINDOW.WINDOW, Math.max(0, Number(visibleCount) || 0));
}
