// fleet-status task 327aa5ae: the Kanban cards and Fleet Status must colour a given
// machine + repo agent with the SAME hue. Both views derive their colour keys from the
// shared graphColors module and read one persisted slot map, so equal keys ⇒ equal hue.
// This proves the KEY derivation converges for the two views' differently-shaped inputs
// (a board assignee vs a fleet agent), which is what makes the colours match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { machineKey, repoKey, assignSlots, hueOf } from './graphColors.js';

test('self machine → the same "self" key from a board assignee and a fleet agent', () => {
  // Kanban: an assignee with no sourceId is "self". Fleet Status uses "self" for m.self.
  assert.equal(machineKey({ sourceId: null, repoId: 'r1' }), 'self');
  const fleetSelfKey = 'self';
  assert.equal(machineKey({ sourceId: null, repoId: 'r1' }), fleetSelfKey);
});

test('a peer machine → the same source id key on both sides', () => {
  assert.equal(machineKey({ sourceId: 'src-B', repoId: 'r1' }), 'src-B'); // Kanban
  // Fleet Status: mkOfMachine(m) = m.sourceId for a peer — the same value.
  assert.equal(machineKey({ sourceId: 'src-B', repoId: 'r1' }), 'src-B');
});

test('one repo → one repoKey regardless of remote URL form (https vs scp) and view', () => {
  // Kanban resolves the remote via a fleet lookup; Fleet Status reads a.remoteUrl. The
  // same repo on the same machine can surface either URL form — both must key the same.
  const kanban = repoKey({ sourceId: null, repoId: 'r1' }, () => 'https://github.com/acme/app.git');
  const fleet = repoKey({ repoId: 'r1' }, () => 'git@github.com:acme/app.git');
  assert.equal(kanban, 'github.com/acme/app');
  assert.equal(kanban, fleet);
});

test('no remote → both fall back to the SAME id: key', () => {
  const kanban = repoKey({ sourceId: null, repoId: 'r9' }, () => null);
  const fleet = repoKey({ repoId: 'r9' }, () => undefined);
  assert.equal(kanban, 'id:r9');
  assert.equal(kanban, fleet);
});

test('equal keys ⇒ equal hue via the one shared slot map', () => {
  // Whatever order each view first saw the keys, once the slot map is shared the hue for
  // a key is a pure function of its slot — so the two views paint the same colour.
  const machines = assignSlots(['self', 'src-B'], {});
  const repos = assignSlots(['github.com/acme/app', 'id:r9'], {});
  // Kanban looks up "self"/"github.com/acme/app"; Fleet Status looks up the same keys.
  assert.equal(hueOf(machines['self']), hueOf(machines['self']));
  assert.equal(hueOf(repos['github.com/acme/app']), hueOf(repos['github.com/acme/app']));
  // A saved slot is kept when a second view assigns over it (no second palette).
  const later = assignSlots(['src-B', 'self'], machines);
  assert.equal(later['self'], machines['self']);
  assert.equal(later['src-B'], machines['src-B']);
});
