// openspec arch-chat-window: one transcript window for every conversation surface —
// the recent tail by default, "Show earlier" widens it in chunks, the fetch tail never
// drops below the default window. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSCRIPT_WINDOW, windowOf, widened, tailFor } from './transcriptWindow.js';

test('the default window is the repo-agent dock\'s: 50 shown, 50 more per reveal', () => {
  assert.equal(TRANSCRIPT_WINDOW.WINDOW, 50);
  assert.equal(TRANSCRIPT_WINDOW.REVEAL_CHUNK, 50);
  assert.ok(Object.isFrozen(TRANSCRIPT_WINDOW));
});

test('a long thread renders only its tail and counts the hidden rest', () => {
  assert.deepEqual(windowOf(3000, 50), { start: 2950, hidden: 2950 });
  assert.deepEqual(windowOf(3000, 100), { start: 2900, hidden: 2900 });
  // A short thread hides nothing; garbage reads as empty.
  assert.deepEqual(windowOf(12, 50), { start: 0, hidden: 0 });
  assert.deepEqual(windowOf(0, 50), { start: 0, hidden: 0 });
  assert.deepEqual(windowOf(undefined, null), { start: 0, hidden: 0 });
  assert.deepEqual(windowOf(-5, -1), { start: 0, hidden: 0 });
});

test('each reveal widens by one chunk and the fetch tail follows, never below the window', () => {
  assert.equal(widened(50), 100);
  assert.equal(widened(100), 150);
  assert.equal(tailFor(50), 50);
  assert.equal(tailFor(150), 150);
  assert.equal(tailFor(0), 50);
  assert.equal(tailFor(undefined), 50);
  // Reveal until nothing is hidden: the arithmetic converges, it never overshoots below zero.
  let v = 50; let steps = 0;
  while (windowOf(230, v).hidden > 0) { v = widened(v); steps++; }
  assert.equal(steps, 4);
  assert.equal(windowOf(230, v).hidden, 0);
});
