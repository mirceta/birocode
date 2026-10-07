// node --test — the Arch examples tab's pure helpers (openspec arch-examples-tab).
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCategories, chartBars, sparkline, sourceLine, copyText, day } from './archExamplesModel.js';

const cats = [
  { id: 'redeploy-hub', name: 'Pull main and redeploy this hub', description: 'A merged PR goes live on the hub.', template: 'Pull main and redeploy on this computer only.', tools: ['send_task'], count: 31, examples: [{ text: 'we merged PR 141, pull and redeploy', at: 1 }] },
  { id: 'hub-files', name: 'Move files through the hub file system', description: 'Large artefacts.', template: 'Transfer <file> from <machine> to <machine>.', tools: ['hub_transfer'], count: 3, endsInGoal: true, examples: [] },
  { id: 'other', name: 'Other', description: '', template: '', tools: [], count: 0, examples: [] },
];

test('keyword filter matches any field, all words must match, empty query keeps everything', () => {
  assert.equal(filterCategories(cats, '').length, 3);
  assert.deepEqual(filterCategories(cats, 'redeploy').map((c) => c.id), ['redeploy-hub']);
  assert.deepEqual(filterCategories(cats, 'hub_transfer').map((c) => c.id), ['hub-files']);
  assert.deepEqual(filterCategories(cats, 'PR 141').map((c) => c.id), ['redeploy-hub']);        // an example's text
  assert.deepEqual(filterCategories(cats, 'hub').map((c) => c.id), ['redeploy-hub', 'hub-files']);
  assert.deepEqual(filterCategories(cats, 'hub transfer').map((c) => c.id), ['hub-files']);
  assert.equal(filterCategories(null, 'x').length, 0);
});

test('bars scale to the largest count and skip empty categories', () => {
  const bars = chartBars(cats);
  assert.deepEqual(bars.map((b) => [b.id, b.pct]), [['redeploy-hub', 100], ['hub-files', 10]]);
  assert.equal(bars[1].endsInGoal, true);
});

test('sparkline points span the width, y from the top, with totals', () => {
  const s = sparkline([{ week: '2026-W36', count: 2 }, { week: '2026-W37', count: 6 }, { week: '2026-W38', count: 0 }], 200, 40);
  assert.equal(s.points, '0,26 100,1 200,39');
  assert.deepEqual([s.max, s.first, s.last, s.total], [6, '2026-W36', '2026-W38', 8]);
  assert.equal(sparkline([]).points, '');
});

test('the source line tells a snapshot from a local mining run; copy text is the template', () => {
  assert.match(sourceLine({ source: 'snapshot', machine: 'DESKTOP-POAPPP3', minedAt: 1791331200000 }), /Snapshot committed .* mined on DESKTOP-POAPPP3 at 2026-10-07/);
  assert.match(sourceLine({ source: 'local', machine: 'DESKTOP-POAPPP3', minedAt: 1791331200000, sources: { messages: 287, transcripts: 10, goals: 7, requests: 12 } }), /287 Operator messages in 10 arch transcripts, 7 goal conversations and 12 repo-agent requests/);
  assert.equal(copyText(cats[0]), 'Pull main and redeploy on this computer only.');
  assert.equal(copyText(null), '');
  assert.equal(day(1791331200000), '2026-10-07');
  assert.equal(day(0), '');
});
