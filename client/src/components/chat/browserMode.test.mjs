// openspec chrome-per-agent-mode: browser mode is a per-agent choice — one agent's 🌐
// never reaches another agent's sends; the old device-global flag is retired, not
// migrated; reload keeps each agent's own toggle. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_KEY, STORE_KEY, agentKeyFor, retireLegacyFlag, loadBrowserAgents, withBrowserOn,
  saveBrowserAgents, isBrowserOn, sendCarriesBrowser, bootstrapBrowserAgents,
} from './browserMode.js';

const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
};

test('the agent key is the dock tab when there is one, else the repo, else nothing', () => {
  assert.equal(agentKeyFor({ tabId: 't1', repoId: 'r1' }), 'tab:t1');
  assert.equal(agentKeyFor({ repoId: 'r1' }), 'repo:r1');
  assert.equal(agentKeyFor({}), null);
  assert.equal(agentKeyFor(), null);
});

test('turning 🌐 on for A leaves B off, and only A\'s builder send carries the browser', () => {
  let map = {};
  map = withBrowserOn(map, 'tab:A', true);
  assert.equal(isBrowserOn(map, 'tab:A'), true);
  assert.equal(isBrowserOn(map, 'tab:B'), false);
  assert.equal(sendCarriesBrowser({ map, agentKey: 'tab:A' }), true);
  assert.equal(sendCarriesBrowser({ map, agentKey: 'tab:B' }), false);
  // A's own ask lane and a codex engine never carry it either.
  assert.equal(sendCarriesBrowser({ map, agentKey: 'tab:A', lane: 'ask' }), false);
  assert.equal(sendCarriesBrowser({ map, agentKey: 'tab:A', provider: 'codex' }), false);
  // Off drops the entry rather than storing false.
  map = withBrowserOn(map, 'tab:A', false);
  assert.deepEqual(map, {});
  assert.equal(withBrowserOn(map, null, true), map);
});

test('reload keeps each agent\'s own toggle', () => {
  const s = fakeStorage();
  saveBrowserAgents(s, withBrowserOn(withBrowserOn({}, 'tab:A', true), 'repo:r9', true));
  const back = loadBrowserAgents(s);
  assert.deepEqual(back, { 'tab:A': true, 'repo:r9': true });
  assert.equal(isBrowserOn(back, 'tab:A'), true);
  assert.equal(isBrowserOn(back, 'tab:B'), false);
  // An empty map clears the key instead of storing "{}".
  saveBrowserAgents(s, {});
  assert.equal(s.getItem(STORE_KEY), null);
});

test('the old device-global flag is retired on first load, never copied onto every agent', () => {
  const s = fakeStorage({ [LEGACY_KEY]: '1' });
  const { map, retiredLegacy } = bootstrapBrowserAgents(s);
  assert.equal(retiredLegacy, true);
  assert.deepEqual(map, {});
  assert.equal(s.getItem(LEGACY_KEY), null);
  assert.equal(isBrowserOn(map, 'tab:A'), false);
  // A second load finds nothing to retire and still reads the (empty) map.
  const again = bootstrapBrowserAgents(s);
  assert.equal(again.retiredLegacy, false);
  assert.deepEqual(again.map, {});
  // A legacy "0" is retired the same way.
  const off = fakeStorage({ [LEGACY_KEY]: '0' });
  assert.equal(retireLegacyFlag(off), true);
  assert.equal(off.getItem(LEGACY_KEY), null);
});

test('a corrupt or foreign store reads as nobody on', () => {
  assert.deepEqual(loadBrowserAgents(fakeStorage({ [STORE_KEY]: 'not json' })), {});
  assert.deepEqual(loadBrowserAgents(fakeStorage({ [STORE_KEY]: '[1,2]' })), {});
  assert.deepEqual(loadBrowserAgents(fakeStorage({ [STORE_KEY]: '{"tab:A":"yes","tab:B":true,"":true}' })), { 'tab:B': true });
  const throwing = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.deepEqual(loadBrowserAgents(throwing), {});
  assert.equal(retireLegacyFlag(throwing), false);
  saveBrowserAgents(throwing, { 'tab:A': true }); // must not throw
});
