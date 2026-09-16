// node --test — Status tab badge descriptors (fleet task a25ee2de): same facts as the
// old raw text, one descriptor each, honest tones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { machineBadges, machineMeta, splitReason, branchBadges, agentDetailBadges, CLAIMED_REASON } from './statusBadges.js';

const labels = (bs) => bs.map((b) => b.label);
const byKey = (bs) => Object.fromEntries(bs.map((b) => [b.key, b]));

test('a reachable peer: build, sync, opt-ins, gate, and whether this hub may send', () => {
  const bs = machineBadges({ reachable: true, self: false, version: '1.0.0+791292b677cec5288910168d98ba1a1025220263', behind: true, acceptsSends: true, acceptsUpgrades: false, gateOpen: false, allowSends: false });
  assert.deepEqual(labels(bs), ['build 791292b', 'behind the hub', 'accepts sends', 'no upgrades', 'gate closed', 'sends not allowed']);
  const k = byKey(bs);
  assert.equal(k.build.mono, true);
  assert.equal(k.sync.tone, 'warn');
  assert.equal(k.sends.tone, 'ok');
  assert.equal(k.upgrades.tone, 'muted');
  assert.equal(k.gate.tone, 'warn');
  assert.equal(k.allow.tone, 'muted');
});

test('a peer on the hub build reads "same build as hub"; the hub itself carries no sync badge', () => {
  const peer = byKey(machineBadges({ reachable: true, self: false, version: '1.0.0+abcdef0', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true }));
  assert.equal(peer.sync.label, 'same build as hub');
  assert.equal(peer.sync.tone, 'ok');
  const self = machineBadges({ reachable: true, self: true, version: '1.0.0+abcdef0', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true });
  assert.deepEqual(labels(self), ['build abcdef0', 'accepts sends', 'no upgrades', 'gate open']);
  assert.ok(!self.some((b) => b.key === 'allow'), 'sends-allowed is a peer fact');
});

test('an unreachable machine shows its status and the detail, nothing invented', () => {
  const bs = machineBadges({ reachable: false, status: 'unreachable', detail: 'timeout after 5 s' });
  assert.deepEqual(labels(bs), ['unreachable', 'timeout after 5 s']);
  assert.equal(bs[0].tone, 'bad');
  assert.deepEqual(labels(machineBadges({ reachable: false, status: 'error' })), ['error']);
});

test('a missing version is an honest unknown, not a blank', () => {
  const b = byKey(machineBadges({ reachable: true, self: true, gateOpen: true })).build;
  assert.equal(b.label, 'build n/a');
  assert.equal(b.tone, 'unknown');
});

test('machine meta: agents, managed, running, hidden — running/hidden only when they apply', () => {
  const m = { agents: [{}, {}, {}], managedCount: 2 };
  assert.deepEqual(labels(machineMeta(m)), ['3 agents', '🏛 2 managed']);
  assert.deepEqual(labels(machineMeta(m, { running: 1, hidden: 2, narrowed: true })), ['3 agents', '🏛 2 managed', '▶ 1 running', '2 hidden by filter']);
  assert.deepEqual(labels(machineMeta(m, { hidden: 2, narrowed: false })), ['3 agents', '🏛 2 managed']);
  assert.equal(labels(machineMeta({ agents: [{}] }))[0], '1 agent');
  const old = byKey(machineMeta({ agents: [] }));
  assert.equal(old.managed.label, '🏛 n/a managed');
  assert.equal(old.managed.tone, 'unknown');
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
