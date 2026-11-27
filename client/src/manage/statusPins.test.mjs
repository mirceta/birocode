import test from 'node:test';
import assert from 'node:assert/strict';
import { pinKey, isPinned, resolvePins, pinLabel, pinBody } from './statusPins.js';

const machines = [
  { sourceId: 'self', machine: 'DESKTOP-POAPPP3', self: true, reachable: true, agents: [{ repoId: 'r1', name: 'prg', key: 'r1' }] },
  { sourceId: 'sx', machine: 'spacex', reachable: true, agents: [{ repoId: 'r2', name: 'msg-platform-agent', key: 'sx/r2' }] },
  { sourceId: 'lr', machine: 'living room', reachable: false, agents: [] },
];
const pins = [
  { sourceId: 'sx', repoId: 'r2', machine: 'spacex', name: 'msg-platform-agent' },
  { sourceId: 'self', repoId: 'r1', machine: 'DESKTOP-POAPPP3', name: 'prg' },
  { sourceId: 'lr', repoId: 'r9', machine: 'living room', name: 'youtube-transcript' },
  { sourceId: 'gone', repoId: 'r7', machine: 'old-box', name: 'x' },
  { sourceId: 'self', repoId: 'r404', machine: 'DESKTOP-POAPPP3', name: 'removed' },
];

test('pins keep their order and resolve to the live agent of the live machine', () => {
  const r = resolvePins(pins, machines);
  assert.deepEqual(r.map((x) => x.key), ['sx|r2', 'self|r1', 'lr|r9', 'gone|r7', 'self|r404']);
  assert.equal(r[0].live, true);
  assert.equal(r[0].agent.name, 'msg-platform-agent');
  assert.equal(r[1].machine.self, true);
});

test('a pin on a dark machine, a vanished machine or a vanished agent stays — greyed with the reason', () => {
  const r = resolvePins(pins, machines);
  assert.deepEqual(r.slice(2).map((x) => x.live), [false, false, false]);
  assert.match(r[2].why, /living room is not answering/);
  assert.match(r[3].why, /no longer in the fleet/);
  assert.match(r[4].why, /not listed/);
  assert.equal(pinLabel(r[2]), 'living room / youtube-transcript');   // the remembered names label it
  assert.equal(pinLabel(r[3]), 'old-box / x');
});

test('labels are "machine / agent"; isPinned and the POST body use sourceId + repoId', () => {
  const r = resolvePins(pins, machines);
  assert.equal(pinLabel(r[0], 'msg-platform'), 'spacex / msg-platform');
  assert.equal(pinLabel(r[1]), 'DESKTOP-POAPPP3 / prg');
  assert.equal(isPinned(pins, 'sx', 'r2'), true);
  assert.equal(isPinned(pins, 'sx', 'r1'), false);
  assert.equal(pinKey('self', 'r1'), 'self|r1');
  assert.deepEqual(pinBody(machines[1], machines[1].agents[0], true), { sourceId: 'sx', repoId: 'r2', pinned: true, machine: 'spacex', name: 'msg-platform-agent' });
});

test('before the first fleet poll answers, a pin says the fleet is loading — not that its machine is gone', () => {
  const r = resolvePins(pins, [], { loaded: false });
  assert.deepEqual([...new Set(r.map((x) => x.why))], ['loading the fleet…']);
  assert.equal(r.every((x) => !x.live), true);
});
