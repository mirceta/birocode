// node --test — Status tab descriptors (fleet task a25ee2de; the machine header's facts grid
// from openspec fleet-status-compact-layout): same facts as the old raw text, honest tones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { machineFacts, splitReason, branchBadges, agentDetailBadges, CLAIMED_REASON } from './statusBadges.js';

const labels = (bs) => bs.map((b) => b.label);
const byKey = (bs) => Object.fromEntries(bs.map((b) => [b.key, b]));

const facts = (m, o) => Object.fromEntries(machineFacts(m, o).map((f) => [f.key, f]));
const COLUMNS = ['status', 'build', 'sync', 'sends', 'upgrades', 'gate', 'allow', 'agents', 'managed', 'running'];

test('a reachable peer: every column, the short honest word per cell, the sentence on the title', () => {
  const fs = machineFacts({ reachable: true, self: false, version: '1.0.0+791292b677cec5288910168d98ba1a1025220263', behind: true, acceptsSends: true, acceptsUpgrades: false, gateOpen: false, allowSends: false, agents: [{}, {}, {}], managedCount: 2 }, { running: 1 });
  assert.deepEqual(fs.map((f) => f.key), COLUMNS);
  assert.deepEqual(fs.map((f) => f.value), ['ok', '791292b', 'behind', 'yes', 'no', 'closed', 'no', '3', '2', '1']);
  const k = byKey(fs);
  assert.equal(k.build.mono, true);
  assert.equal(k.sync.tone, 'warn');
  assert.equal(k.sends.tone, 'ok');
  assert.equal(k.upgrades.tone, 'muted');
  assert.equal(k.gate.tone, 'warn');
  assert.equal(k.allow.tone, 'muted');
  assert.equal(k.managed.tone, 'accent');
  assert.equal(k.running.tone, 'ok');
  assert.match(k.sync.title, /different build/);
});

test('the hub itself keeps every column: hub sync and may-send read "—", never dropped', () => {
  const self = machineFacts({ reachable: true, self: true, version: '1.0.0+abcdef0', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, agents: [], managedCount: 0 });
  assert.deepEqual(self.map((f) => f.key), COLUMNS);
  const k = byKey(self);
  assert.equal(k.sync.value, '—');
  assert.equal(k.allow.value, '—');
  assert.equal(k.gate.value, 'open');
  assert.equal(k.running.value, '0');
  assert.equal(k.running.tone, 'muted');
  const peer = facts({ reachable: true, self: false, version: '1.0.0+abcdef0', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, agents: [] });
  assert.equal(peer.sync.value, 'same');
  assert.equal(peer.sync.tone, 'ok');
  assert.equal(peer.allow.value, 'yes');
});

test('an unreachable machine: status says so, what it cannot report is "?", the row keeps every column', () => {
  const fs = machineFacts({ reachable: false, status: 'unreachable', detail: 'timeout after 5 s', agents: [] });
  assert.deepEqual(fs.map((f) => f.key), COLUMNS);
  const k = byKey(fs);
  assert.equal(k.status.value, 'unreachable');
  assert.equal(k.status.tone, 'bad');
  assert.match(k.status.title, /timeout after 5 s/);
  assert.deepEqual(['sync', 'sends', 'upgrades', 'gate', 'allow'].map((c) => k[c].value), ['?', '?', '?', '?', '?']);
  assert.ok(['sync', 'sends', 'upgrades', 'gate', 'allow'].every((c) => k[c].tone === 'unknown'));
  assert.equal(k.build.value, 'n/a');
  assert.equal(facts({ reachable: false, status: 'error' }).status.value, 'error');
});

test('a missing version / managed count is an honest unknown, not a blank', () => {
  const k = facts({ reachable: true, self: true, gateOpen: true, agents: [{}] });
  assert.equal(k.build.value, 'n/a');
  assert.equal(k.build.tone, 'unknown');
  assert.equal(k.managed.value, 'n/a');
  assert.equal(k.managed.tone, 'unknown');
  assert.equal(k.agents.value, '1');
});

test('hidden-by-filter is a column for every machine while a filter is on, and absent otherwise', () => {
  const m = { reachable: true, self: true, version: '1.0.0+abcdef0', gateOpen: true, agents: [{}, {}, {}], managedCount: 2 };
  assert.deepEqual(machineFacts(m, { running: 1, hidden: 2, narrowed: true }).map((f) => f.key), [...COLUMNS, 'hidden']);
  assert.equal(facts(m, { hidden: 2, narrowed: true }).hidden.value, '2');
  assert.equal(facts(m, { hidden: 0, narrowed: true }).hidden.value, '0');
  assert.equal(facts(m, { hidden: 0, narrowed: true }).hidden.tone, 'muted');
  assert.equal(facts(m, { hidden: 2, narrowed: false }).hidden, undefined);
});

test('splitReason keeps the whole reason beside the state', () => {
  assert.deepEqual(splitReason('unknown — machine not reachable (unreachable: timeout)'), { head: 'unknown', reason: 'machine not reachable (unreachable: timeout)' });
  assert.deepEqual(splitReason('no session — sign in to see usage'), { head: 'no session', reason: 'sign in to see usage' });
  assert.deepEqual(splitReason('yes'), { head: 'yes', reason: null });
  assert.deepEqual(splitReason(null), { head: '', reason: null });
});

test('branch badges: free / claimed / unknown, plus dirty', () => {
  assert.deepEqual(branchBadges({ branch: 'main', onDefault: true }).map((b) => b.tone), ['ok']);
  assert.deepEqual(branchBadges({ branch: 'feature/x', onDefault: false, dirty: true }).map((b) => [b.key, b.tone]), [['state', 'warn'], ['dirty', 'warn']]);
  assert.equal(branchBadges({ branch: 'unknown' })[0].tone, 'unknown');
});

test('agent detail badges carry every fact the text row did, with data hooks intact', () => {
  const a = { runningSince: 1, lastActor: 'arch', availability: 'claimed', claimedReason: 'human-active', adopted: true, pinned: true, managed: true, docked: true, goal: { id: 'g1', name: 'Deploy train' } };
  const bs = agentDetailBadges(a, { runningFor: '2 min' });
  assert.deepEqual(labels(bs), [
    '▶ running for 2 min', 'last actor arch', 'claimed', CLAIMED_REASON['human-active'],
    'handed to the arch', '📌 pinned as the Operator\'s', '🏛 in the arch scope', 'has a dock', 'driven by arch goal g1 (Deploy train)',
  ]);
  const k = byKey(bs);
  assert.deepEqual(k.claimedReason.data, { claimedReason: 'human-active' });
  assert.deepEqual(k.goal.data, { drivenByGoal: 'g1' });
  assert.equal(k.availability.tone, 'warn');
  const idle = byKey(agentDetailBadges({ availability: 'available', managed: false }));
  assert.equal(idle.run.label, 'idle');
  assert.equal(idle.availability.tone, 'ok');
  assert.equal(idle.managed.label, 'not in the arch scope');
  assert.equal(byKey(agentDetailBadges({})).availability.tone, 'unknown');
});
