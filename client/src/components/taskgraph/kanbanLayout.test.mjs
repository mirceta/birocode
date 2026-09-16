// fleet task 0a57d282: the Kanban column layout model — show/hide columns, per-column
// widths (clamped), normalisation of whatever comes off the wire, and the save/restore
// equality the buttons rely on. Pure — no DOM. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, defaultLayout, normalizeLayout, toggleColumn, isVisible,
  widthOf, setWidth, dragWidth, sameLayout, toWire, clampWidth,
} from './kanbanLayout.js';
import { STATUS_KEYS } from './kanbanColumns.js';

test('default layout shows every lifecycle column at the default width', () => {
  const l = defaultLayout();
  assert.deepEqual(l.visible, STATUS_KEYS);
  for (const k of STATUS_KEYS) assert.equal(widthOf(l, k), DEFAULT_WIDTH);
});

test('toggleColumn hides and re-shows a column, keeping canonical column order', () => {
  let l = defaultLayout();
  l = toggleColumn(l, 'committed');
  assert.equal(isVisible(l, 'committed'), false);
  assert.deepEqual(l.visible, STATUS_KEYS.filter((k) => k !== 'committed'));
  l = toggleColumn(toggleColumn(l, 'todo'), 'committed'); // hide todo, re-show committed
  assert.deepEqual(l.visible, STATUS_KEYS.filter((k) => k !== 'todo')); // order restored, not appended
  assert.equal(toggleColumn(l, 'blocked'), l); // not a column here (blocked is a chip) → no-op
  // Hiding everything is allowed; the board renders its own note for that.
  const none = STATUS_KEYS.reduce((acc, k) => toggleColumn(acc, k), defaultLayout());
  assert.deepEqual(none.visible, []);
});

test('setWidth / dragWidth clamp to the sensible range and never break other columns', () => {
  const l = setWidth(defaultLayout(), 'doing', 400);
  assert.equal(widthOf(l, 'doing'), 400);
  assert.equal(widthOf(l, 'todo'), DEFAULT_WIDTH);
  assert.equal(widthOf(setWidth(l, 'doing', 10), 'doing'), MIN_WIDTH);
  assert.equal(widthOf(setWidth(l, 'doing', 5000), 'doing'), MAX_WIDTH);
  assert.equal(dragWidth(240, -30), 210);
  assert.equal(dragWidth(240, -500), MIN_WIDTH);
  assert.equal(clampWidth('abc'), DEFAULT_WIDTH);
  assert.equal(setWidth(l, 'nope', 300), l);
});

test('normalizeLayout accepts the server payload, drops unknown keys, clamps, honours an empty visible list', () => {
  const n = normalizeLayout({ visible: ['done', 'todo', 'ghost'], widths: { todo: 320, ghost: 300, doing: 1, done: '500' }, savedAt: 1 });
  assert.deepEqual(n.visible, ['todo', 'done']);
  assert.deepEqual(n.widths, { todo: 320, doing: MIN_WIDTH, done: 500 });
  assert.deepEqual(normalizeLayout(null), defaultLayout());
  assert.deepEqual(normalizeLayout('garbage'), defaultLayout());
  assert.deepEqual(normalizeLayout({ widths: { todo: 300 } }).visible, STATUS_KEYS); // no visible key → all shown
  assert.deepEqual(normalizeLayout({ visible: [] }).visible, []);                  // explicit none → none
});

test('sameLayout is the save/restore equality: visible set + effective widths', () => {
  const a = setWidth(toggleColumn(defaultLayout(), 'pr-merged'), 'todo', 300);
  const b = normalizeLayout(toWire(a)); // what comes back after a save round-trip
  assert.ok(sameLayout(a, b));
  assert.ok(!sameLayout(a, setWidth(a, 'todo', 301)));
  assert.ok(!sameLayout(a, toggleColumn(a, 'pr-merged')));
  // A stored width equal to the default is the same board as no stored width.
  assert.ok(sameLayout(defaultLayout(), setWidth(defaultLayout(), 'doing', DEFAULT_WIDTH)));
  assert.ok(!sameLayout(a, null));
});
