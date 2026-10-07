// openspec status-agents-attention: the split / merged layout memory, the "finished, not yet
// checked" reading on top of the dock's unseen-result latch, the merged order, the optimistic
// acknowledgement. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_KEY, LAYOUTS, readLayout, isRunning, isFinishedUnchecked, needsAttention, attentionState, mergedList, occupancyMarker, orderAgents, checkedBody, reconcileAcked, withAck } from './agentsView.js';
import { matchesFilter, OCCUPANCY_FILTERS } from './occupancy.js';

const running = { key: 'a', runningSince: 1000, unseenResult: false, occupancy: { occupied: true, source: 'branch' } };
const finished = { key: 'b', runningSince: null, unseenResult: true, occupancy: { occupied: false, source: 'branch' } };
const idle = { key: 'c', runningSince: null, unseenResult: false, occupancy: { occupied: false, source: 'branch' } };
const oldPeer = { key: 'd', runningSince: null, occupancy: { occupied: true, source: 'branch' } };   // no field at all

test('layout: split by default, merged when remembered, anything else falls back', () => {
  assert.deepEqual(LAYOUTS, ['split', 'merged']);
  assert.equal(readLayout(() => null), 'split');
  assert.equal(readLayout((k) => (k === LAYOUT_KEY ? 'merged' : null)), 'merged');
  assert.equal(readLayout(() => 'sideways'), 'split');
  assert.equal(readLayout(() => { throw new Error('private mode'); }), 'split');
});

test('finished-not-checked is the unseen latch without a running turn; running outranks it', () => {
  assert.ok(isRunning(running) && !isFinishedUnchecked(running) && needsAttention(running));
  assert.ok(!isRunning(finished) && isFinishedUnchecked(finished) && needsAttention(finished));
  assert.ok(!needsAttention(idle) && !needsAttention(oldPeer));
  assert.ok(!isFinishedUnchecked({ runningSince: 5, unseenResult: true }));
  assert.deepEqual([running, finished, idle, oldPeer].map(attentionState), ['running', 'finished', 'idle', 'idle']);
});

test('the running filter keeps a finished, unchecked agent until it is marked checked', () => {
  assert.ok(matchesFilter(running, 'running'));
  assert.ok(matchesFilter(finished, 'running'));
  assert.ok(!matchesFilter(idle, 'running'));
  assert.ok(!matchesFilter(oldPeer, 'running'));
  assert.ok(!matchesFilter({ ...finished, unseenResult: false }, 'running'));   // after the dedicated dismiss
  assert.match(OCCUPANCY_FILTERS.find(([k]) => k === 'running')[2], /not yet checked/);
});

test('merged mode is one list, occupied first then free, each in its own order; the marker names the section', () => {
  const a1 = { key: '1', occupancy: { occupied: false, source: 'branch' } };
  const a2 = { key: '2', occupancy: { occupied: true, source: 'operator' } };
  const a3 = { key: '3', occupancy: { occupied: false, source: 'branch' } };
  const a4 = { key: '4', occupancy: { occupied: true, source: 'branch' } };
  assert.deepEqual(mergedList([a1, a2, a3, a4]).map((a) => a.key), ['2', '4', '1', '3']);
  assert.deepEqual([a1, a2].map(occupancyMarker), ['free', 'occupied']);
  assert.deepEqual(mergedList([]), []);
});

test('acknowledgement: the body names the machine and repo; an acked key hides the latch until the agent runs again', () => {
  assert.deepEqual(checkedBody(null, 'r-prg'), { sourceId: null, repoId: 'r-prg' });
  assert.deepEqual(checkedBody('src-m', 'r-web'), { sourceId: 'src-m', repoId: 'r-web' });
  const acked = new Set(['b']);
  assert.equal(withAck(finished, acked).unseenResult, false);
  assert.equal(withAck(finished, new Set()).unseenResult, true);
  assert.equal(withAck(running, new Set(['a'])).runningSince, 1000);
  assert.deepEqual([...reconcileAcked(acked, [finished])], ['b']);                          // still finished: stays acked
  assert.deepEqual([...reconcileAcked(acked, [{ ...finished, runningSince: 7 }])], []);     // a new turn: the ack is spent
  assert.equal(reconcileAcked(new Set(), [running]).size, 0);
});

test('orderAgents: running first, then finished-unchecked, then idle — alphabetical within, stable otherwise', () => {
  const list = [
    { key: 'z', name: 'zeta', runningSince: null, unseenResult: false },
    { key: 'f2', name: 'prg', runningSince: null, unseenResult: true },
    { key: 'r2', name: 'web-flow', runningSince: 5, unseenResult: false },
    { key: 'a', name: 'alpha', runningSince: null, unseenResult: false },
    { key: 'r1', name: 'Birokrat', runningSince: 9, unseenResult: false },
    { key: 'f1', name: 'birokrat-ai', runningSince: null, unseenResult: true },
    { key: 'a2', name: 'alpha', runningSince: null, unseenResult: false },
  ];
  assert.deepEqual(orderAgents(list).map((a) => a.key), ['r1', 'r2', 'f1', 'f2', 'a', 'a2', 'z']);
  assert.deepEqual(orderAgents([]), []);
  assert.deepEqual(orderAgents(null), []);
  assert.deepEqual(list.map((a) => a.key), ['z', 'f2', 'r2', 'a', 'r1', 'f1', 'a2'], 'the input is not mutated');
});
