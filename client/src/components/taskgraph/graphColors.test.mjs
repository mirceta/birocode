// openspec taskgraph-colours: colour assignment is stable (a key keeps its slot across
// calls and reloads), unique up to the palette size, neutral for unassigned tasks,
// and repo keys unify the same remote across machines. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE_SIZE, assignSlots, hueOf, machineKey, repoKey, normalizeRemote, nodeStyle, readSlots, writeSlots,
} from './graphColors.js';

test('first-seen keys get distinct slots up to the palette size', () => {
  const keys = Array.from({ length: PALETTE_SIZE }, (_, i) => `m${i}`);
  const slots = assignSlots(keys);
  assert.equal(new Set(Object.values(slots)).size, PALETTE_SIZE);
  assert.equal(slots.m0, 0);
  assert.equal(slots[`m${PALETTE_SIZE - 1}`], PALETTE_SIZE - 1);
});

test('a key keeps its slot when the list changes order or grows', () => {
  const first = assignSlots(['spacex', 'MONSTER']);
  const again = assignSlots(['MONSTER', 'newbox', 'spacex'], first);
  assert.equal(again.spacex, first.spacex);
  assert.equal(again.MONSTER, first.MONSTER);
  assert.equal(again.newbox, 2);
});

test('a removed key frees its hue for the next newcomer without moving others', () => {
  const saved = { a: 0, b: 1, c: 2 };
  const slots = assignSlots(['a', 'c', 'd'], { a: 0, c: 2 }); // b gone
  assert.equal(slots.a, saved.a);
  assert.equal(slots.c, saved.c);
  assert.equal(slots.d, 1);
});

test('beyond the palette size, slots wrap deterministically', () => {
  const keys = Array.from({ length: PALETTE_SIZE + 2 }, (_, i) => `k${i}`);
  const slots = assignSlots(keys);
  assert.equal(hueOf(slots[`k${PALETTE_SIZE}`]), hueOf(0));
  assert.equal(hueOf(slots[`k${PALETTE_SIZE + 1}`]), hueOf(1));
});

test('unassigned tasks have no machine, no repo and a neutral style', () => {
  assert.equal(machineKey({ repoId: null, sourceId: 'x' }), null);
  assert.equal(repoKey({ repoId: null }), null);
  assert.deepEqual(nodeStyle(null, null), {});
  assert.deepEqual(Object.keys(nodeStyle(3, null)), ['--tg-machine-h']);
});

test('machine key is the source id, or self for this box', () => {
  assert.equal(machineKey({ repoId: 'r', sourceId: null }), 'self');
  assert.equal(machineKey({ repoId: 'r', sourceId: '22c1' }), '22c1');
});

test('repo key unifies the same remote across machines and spellings', () => {
  const remotes = { 'self|r1': 'https://github.com/mirceta/birocode.git', '22c1|r9': 'git@github.com:mirceta/birocode.git' };
  const remoteOf = (n) => remotes[`${n.sourceId || 'self'}|${n.repoId}`];
  const a = repoKey({ repoId: 'r1', sourceId: null }, remoteOf);
  const b = repoKey({ repoId: 'r9', sourceId: '22c1' }, remoteOf);
  assert.equal(a, 'github.com/mirceta/birocode');
  assert.equal(a, b);
  assert.equal(repoKey({ repoId: 'r2', sourceId: null }, () => null), 'id:r2');
});

test('normalizeRemote strips scheme, user, .git and case', () => {
  assert.equal(normalizeRemote('HTTPS://User@GitHub.com/Org/Repo.git/'), 'github.com/org/repo');
  assert.equal(normalizeRemote(''), null);
  assert.equal(normalizeRemote(undefined), null);
});

test('slots round-trip through storage and survive malformed data', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  writeSlots(storage, { machines: { self: 0 }, repos: { 'github.com/a/b': 4 } });
  const back = readSlots(storage);
  assert.equal(back.machines.self, 0);
  assert.equal(back.repos['github.com/a/b'], 4);
  storage.setItem('claudeweb_taskgraph_palette', '{not json');
  assert.deepEqual(readSlots(storage), { machines: {}, repos: {} });
});
