// openspec board-check-provenance: the Board check subtab's words are pure functions of the
// status and journal payloads — state, timing, one line per entry, the explainer's data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkState, timingLine, entrySummary, entryWhen, verdictLine, triggerWord, PASS, WRITES, NEVER, WRITERS, TRIGGERS } from './boardCheck.js';

const now = 1_700_000_000_000;

test('the headline state: loading, no pass yet, running, or the cadence and count', () => {
  assert.deepEqual(checkState(null), ['loading', 'loading…']);
  assert.deepEqual(checkState({ lastAt: null, passes: 0, intervalSeconds: 60 }), ['off', 'no pass yet']);
  assert.deepEqual(checkState({ running: true, lastAt: now, passes: 3 }), ['busy', 'pass running']);
  assert.deepEqual(checkState({ lastAt: now, passes: 1, intervalSeconds: 60 }), ['on', 'every 60 s · 1 pass since start']);
  assert.deepEqual(checkState({ lastAt: now, passes: 41, intervalSeconds: 60 }), ['on', 'every 60 s · 41 passes since start']);
});

test('the timing line names the last trigger and the next due time', () => {
  assert.equal(timingLine({ lastAt: null }, now), 'no pass yet');
  const line = timingLine({ lastAt: now - 12_000, nextDueAt: now + 48_000, last: { trigger: 'timer' }, startedAt: now - 3600_000 }, now);
  assert.match(line, /^last pass 12 s ago \(the minute timer\) · next in 48 s · running since /);
  assert.match(timingLine({ lastAt: now - 5_000, nextDueAt: now - 1, last: { trigger: 'operator' } }, now), /you pressed Re-verify.*next any moment/);
  assert.equal(triggerWord('policeman'), TRIGGERS.policeman);
  assert.equal(triggerWord('weird'), 'weird');
});

test('one entry in a sentence: moves, flags, quiet runs, errors', () => {
  assert.equal(entrySummary({ changes: [], raised: [], cleared: [], repeats: 1 }), 'quiet — nothing to move, nothing to flag');
  assert.equal(entrySummary({ changes: [], raised: [], cleared: [], repeats: 37 }), '37 quiet passes — nothing to move, nothing to flag');
  assert.equal(entrySummary({ changes: [{}, {}], raised: [{}], cleared: [], repeats: 1 }), 'moved 2 cards · raised 1 🆘');
  assert.equal(entrySummary({ changes: [{}], raised: [], cleared: [{}, {}], repeats: 1 }), 'moved 1 card · cleared 2 🆘');
  assert.equal(entrySummary({ error: 'gh: not logged in', changes: [], raised: [], cleared: [] }), 'failed: gh: not logged in');
});

test('when: one time, or the span of a coalesced run', () => {
  assert.equal(entryWhen({ at: now - 90_000, lastAt: now - 90_000, repeats: 1 }, now), '1 min ago');
  assert.equal(entryWhen({ at: now - 3600_000, lastAt: now - 60_000, repeats: 60 }, now), '1 h → 1 min ago');
  assert.equal(verdictLine({ honest: 4, dishonest: 1, stuck: 1, manual: 0 }), '4 honest · 1 not verified yet · 1 need human · 0 manual');
  assert.equal(verdictLine(null), 'no verdict yet');
});

test('the explainer data is complete: five steps, four writes, five nevers, six rows comparing the two writers', () => {
  assert.equal(PASS.length, 5);
  assert.deepEqual(PASS.map((s) => s[0]), ['git', 'GitHub', 'move', 'judge', 'flag']);
  assert.equal(WRITES.length, 4);
  assert.ok(WRITES.some(([w]) => /board-check/.test(w)), 'the flag names its own actor');
  assert.equal(NEVER.length, 5);
  assert.ok(NEVER.some((n) => /backwards/.test(n)) && NEVER.some((n) => /conversation/.test(n)));
  assert.equal(WRITERS.length, 6);
  for (const row of WRITERS) assert.equal(row.length, 3, 'label · Board check · Policeman');
});
