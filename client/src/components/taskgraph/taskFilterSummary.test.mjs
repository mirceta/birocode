// openspec kanban-collapsible-filters: the folded bar's summary chips (one per active
// value, bar order, labels applied, the text search as one chip), removing one chip,
// the badge count, the one-line summary, and the fold state remembered per browser
// (collapsed when nothing was remembered). Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilter } from './taskFilters.js';
import {
  COLLAPSED, EXPANDED, FOLD_KEY, activeCount, readFold, summaryChips, summaryLine, withoutChip, writeFold,
} from './taskFilterSummary.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const filter = (over = {}) => ({ ...emptyFilter(), ...over });

test('nothing active → no chips, count 0, empty line', () => {
  assert.deepEqual(summaryChips(emptyFilter()), []);
  assert.equal(activeCount(emptyFilter()), 0);
  assert.equal(summaryLine([]), '');
  // The graph's hide toggle is a display choice, not a filter.
  assert.deepEqual(summaryChips(filter({ hide: true })), []);
});

test('one chip per active value, in the bar order, the text search last and as one chip', () => {
  const f = filter({ q: '  prg invoice ', machines: ['spacex'], agents: ['unassigned'], states: ['doing', 'todo'], flags: ['blocked'] });
  const chips = summaryChips(f, { states: (k) => ({ doing: 'Doing', todo: 'Todo' }[k] || k), flags: (k) => `⛔ ${k}` });
  assert.deepEqual(chips.map((c) => `${c.kind}: ${c.text}`), [
    'machine: spacex', 'agent: Unassigned', 'state: Doing', 'state: Todo', 'flag: ⛔ blocked', 'text: prg invoice',
  ]);
  assert.equal(activeCount(f), 6);
  assert.equal(summaryLine(chips.slice(0, 3)), 'machine: spacex · agent: Unassigned · state: Doing');
});

test('a chip\'s × removes only that value; the text chip clears the search; the rest stays', () => {
  const f = filter({ q: 'prg', machines: ['spacex', 'razvoj2016'], states: ['doing'] });
  const chips = summaryChips(f);
  const noSpacex = withoutChip(f, chips.find((c) => c.group === 'machines' && c.value === 'spacex'));
  assert.deepEqual(noSpacex.machines, ['razvoj2016']);
  assert.deepEqual(noSpacex.states, ['doing']);
  assert.equal(noSpacex.q, 'prg');
  const noText = withoutChip(f, chips.find((c) => c.group === 'q'));
  assert.equal(noText.q, '');
  assert.deepEqual(noText.machines, ['spacex', 'razvoj2016']);
  // Unknown chip / no chip: unchanged.
  assert.deepEqual(withoutChip(f, null), f);
  assert.deepEqual(withoutChip(f, { group: 'nope', value: 'x' }), f);
});

test('fold state: collapsed by default, remembered per browser, garbage reads as collapsed', () => {
  const s = mem();
  assert.equal(readFold(s), COLLAPSED);
  writeFold(s, EXPANDED);
  assert.equal(s.getItem(FOLD_KEY), EXPANDED);
  assert.equal(readFold(s), EXPANDED);
  writeFold(s, COLLAPSED);
  assert.equal(readFold(s), COLLAPSED);
  s.setItem(FOLD_KEY, 'sideways');
  assert.equal(readFold(s), COLLAPSED);
  assert.equal(readFold(null), COLLAPSED);
  assert.equal(readFold({ getItem() { throw new Error('private mode'); } }), COLLAPSED);
});
