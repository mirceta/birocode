// openspec manual-agent-occupancy: the Operator's setting wins over the branch rule, the
// two sections per machine, the occupancy-based filter chips (with the legacy chips mapped).
// Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { occupancyOf, isOccupied, isManual, splitByOccupancy, matchesFilter, normalizeFilter, OCCUPANCY_FILTERS, occupancyBadge, occupancyBody } from './occupancy.js';

const branchFree = { key: 'a', branch: 'main', onDefault: true, occupancy: { occupied: false, source: 'branch' } };
const branchBusy = { key: 'b', branch: 'feature/x', onDefault: false, occupancy: { occupied: true, source: 'branch' } };
const manualOcc = { key: 'c', branch: 'main', onDefault: true, occupancy: { occupied: true, source: 'operator', setAt: 1, note: 'linked to web-flow' } };
const manualFree = { key: 'd', branch: 'feature/y', onDefault: false, occupancy: { occupied: false, source: 'operator', setAt: 2 } };
const oldHub = { key: 'e', branch: 'feature/z', onDefault: false };

test('the server\'s occupancy is read as given; the Operator\'s setting says so', () => {
  assert.deepEqual([occupancyOf(branchFree).occupied, occupancyOf(branchBusy).occupied], [false, true]);
  assert.equal(occupancyOf(manualOcc).title, 'occupied — set by the Operator (linked to web-flow)');
  assert.ok(isManual(manualOcc) && isManual(manualFree) && !isManual(branchBusy));
  assert.equal(occupancyOf(manualFree).occupied, false);              // free although on a feature branch
});

test('a hub without the field falls back to the branch rule', () => {
  assert.equal(isOccupied(oldHub), true);
  assert.equal(occupancyOf(oldHub).source, 'branch');
  assert.equal(isOccupied({ branch: 'main', onDefault: true }), false);
});

test('each machine splits into occupied on top and free below, order kept', () => {
  const { occupied, free } = splitByOccupancy([branchFree, branchBusy, manualOcc, manualFree, oldHub]);
  assert.deepEqual(occupied.map((a) => a.key), ['b', 'c', 'e']);
  assert.deepEqual(free.map((a) => a.key), ['a', 'd']);
  assert.deepEqual(splitByOccupancy([]), { occupied: [], free: [] });
});

test('filters are occupancy-based and the old branch chips map onto them', () => {
  assert.deepEqual(OCCUPANCY_FILTERS.map(([k]) => k), ['all', 'free', 'occupied', 'running', 'managed']);
  assert.equal(normalizeFilter('main'), 'free');
  assert.equal(normalizeFilter('feature'), 'occupied');
  assert.equal(normalizeFilter('bogus'), 'all');
  assert.ok(matchesFilter(manualFree, 'free') && !matchesFilter(manualFree, 'occupied'));
  assert.ok(matchesFilter(manualOcc, 'occupied'));
  assert.ok(matchesFilter({ runningSince: 5 }, 'running') && matchesFilter({ managed: true }, 'managed'));
});

test('the detail badge and the request body', () => {
  const b = occupancyBadge(manualOcc);
  assert.equal(b.label, '✋ occupied — set by the Operator');
  assert.deepEqual([b.tone, b.data], ['warn', { occupied: true, occupancySource: 'operator' }]);
  assert.equal(occupancyBadge(branchFree).label, 'free — branch rule');
  assert.deepEqual(occupancyBody('', 'r1', null), { sourceId: null, repoId: 'r1', occupied: null });
  assert.deepEqual(occupancyBody('src-a', 'r2', true), { sourceId: 'src-a', repoId: 'r2', occupied: true });
});
