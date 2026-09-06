// openspec task-filters: the shared filter model — AND across groups, OR within, the
// Unassigned chips, faceted counts, the URL round trip (bookmarkable), the saved
// filter, agent handles with the numeric-suffix fallback, and state chips that follow
// the board's columns. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNASSIGNED, emptyFilter, isNarrowed, toggleValue, normalizeFilter, hasFilterParams, parseFilter, formatFilter,
  withFilterInUrl, readSavedFilter, writeSavedFilter, agentHandles, filterContext, taskView, matchesTask, applyFilter,
  facets, chipsOf, blockedIds,
} from './taskFilters.js';
import { COLUMNS, columnOf } from './kanbanColumns.js';

const fleet = {
  machines: [
    { self: true, sourceId: 'self-id', machine: 'MONSTER', agents: [
      { repoId: 'r-web', name: 'birocode', handle: 'MONSTER/birocode' },
      { repoId: 'r-arc', name: 'game-arcade', handle: 'MONSTER/game-arcade' },
    ] },
    { self: false, sourceId: 'src-spacex', machine: 'spacex', agents: [
      { repoId: 'p1', name: 'prg' },           // no handle from an older build → fallback
      { repoId: 'p2', name: 'prg' },           // same name on the same machine → #2
      { repoId: 'p3', name: 'prg#2' },         // literally named prg#2 → the next free suffix
    ] },
  ],
};
const nodes = [
  { id: 'a', title: 'Ship filters', note: 'kanban', repoId: 'r-web', sourceId: null, status: 'doing' },
  { id: 'b', title: 'Arcade sounds', repoId: 'r-arc', sourceId: null, status: 'todo' },
  { id: 'c', title: 'Prg deploy', repoId: 'p1', sourceId: 'src-spacex', status: 'todo' },
  { id: 'd', title: 'Prg tests', repoId: 'p2', sourceId: 'src-spacex', status: 'done' },
  { id: 'e', title: 'Write the plan', repoId: null, sourceId: null, status: 'todo' },
  { id: 'f', title: 'Ghost agent', repoId: 'gone-repo-id', sourceId: 'src-spacex', status: 'doing' },
];
const edges = [{ id: 'e1', source: 'b', target: 'e' }]; // b waits on e (not done) → b blocked
const ctx = filterContext(fleet, columnOf);
const blocked = blockedIds(nodes, edges);
const views = nodes.map((n) => taskView(n, ctx, blocked.has(n.id) ? ['blocked'] : []));
const byId = Object.fromEntries(views.map((v) => [v.id, v]));

test('agent handles: fleet handle when present, else machine/name with a numeric suffix on repeats', () => {
  const h = agentHandles(fleet);
  assert.equal(h.get('self|r-web').handle, 'MONSTER/birocode');
  assert.equal(h.get('src-spacex|p1').handle, 'spacex/prg');
  assert.equal(h.get('src-spacex|p2').handle, 'spacex/prg#2');
  assert.equal(h.get('src-spacex|p3').handle, 'spacex/prg#2#2');
});

test('a task view carries machine, agent handle, state (the Kanban column) and flags', () => {
  assert.equal(byId.a.machine, 'MONSTER');
  assert.equal(byId.a.agent, 'MONSTER/birocode');
  assert.equal(byId.a.state, 'doing');
  assert.equal(byId.b.state, 'assigned');
  assert.deepEqual(byId.b.flags, ['blocked']);
  assert.equal(byId.e.machine, null);
  assert.equal(byId.e.agent, null);
  assert.equal(byId.e.state, 'backlog');
  // An assignee the fleet no longer knows keeps a readable, stable handle.
  assert.equal(byId.f.agent, 'spacex/gone-rep');
  assert.equal(byId.f.machine, 'spacex');
});

test('empty filter shows everything; OR within a group; AND across groups', () => {
  const f = emptyFilter();
  assert.equal(applyFilter(views, f).size, views.length);
  assert.equal(isNarrowed(f), false);

  const machines = { ...f, machines: ['MONSTER', 'spacex'] };
  assert.deepEqual([...applyFilter(views, machines)].sort(), ['a', 'b', 'c', 'd', 'f']);

  const both = { ...f, machines: ['spacex'], states: ['assigned'] };
  assert.deepEqual([...applyFilter(views, both)], ['c']);

  const agentAndState = { ...f, agents: ['MONSTER/birocode'], states: ['assigned'] };
  assert.equal(applyFilter(views, agentAndState).size, 0);

  const flagged = { ...f, flags: ['blocked'] };
  assert.deepEqual([...applyFilter(views, flagged)], ['b']);
  assert.equal(isNarrowed(flagged), true);
});

test('the Unassigned chip matches tasks with no agent, in the machine and the agent group', () => {
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), machines: [UNASSIGNED] })], ['e']);
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), agents: [UNASSIGNED] })], ['e']);
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), machines: [UNASSIGNED, 'MONSTER'] })].sort(), ['a', 'b', 'e']);
});

test('the text search matches title, note, machine, agent and state, every word', () => {
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), q: 'prg' })].sort(), ['c', 'd']);
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), q: 'spacex assigned' })], ['c']);
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), q: 'KANBAN' })], ['a']);
  assert.equal(matchesTask(byId.e, { ...emptyFilter(), q: 'nothing-like-this' }), false);
});

test('faceted counts follow the OTHER groups; state chips follow the columns; flag chips only when present', () => {
  const f = { ...emptyFilter(), machines: ['spacex'] };
  const fx = facets(views, f, COLUMNS);
  // Machine counts ignore the machine selection itself (so the other chips stay pickable).
  assert.equal(fx.machines.get('MONSTER'), 2);
  assert.equal(fx.machines.get('spacex'), 3);
  assert.equal(fx.machines.get(UNASSIGNED), 1);
  // State counts are narrowed by the machine selection.
  assert.equal(fx.states.get('assigned'), 1);
  assert.equal(fx.states.get('done'), 1);
  assert.equal(fx.states.get('doing'), 1);
  assert.equal(fx.states.get('backlog') || 0, 0);
  assert.deepEqual(fx.stateKeys, ['backlog', 'assigned', 'doing', 'done']);
  assert.deepEqual(fx.flagKeys, ['blocked']); // no task is stale → no stale chip
  assert.equal(fx.total, 6);
  assert.equal(fx.shown, 3);

  // A future column reported by columnOf appears automatically, after the known ones.
  const future = [...views, { id: 'z', title: 'PR', machine: null, agent: null, state: 'pr-opened', flags: [], text: 'pr' }];
  assert.deepEqual(facets(future, emptyFilter(), COLUMNS).stateKeys, ['backlog', 'assigned', 'doing', 'done', 'pr-opened']);
  assert.deepEqual(facets(views, emptyFilter(), COLUMNS).flagKeys, ['blocked']);
  assert.deepEqual(facets(views, { ...emptyFilter(), flags: ['stale'] }, COLUMNS).flagKeys, ['blocked', 'stale']);
});

test('chips list every key with its count, keep a selected key that vanished, Unassigned last', () => {
  const fx = facets(views, emptyFilter(), COLUMNS);
  const chips = chipsOf(fx.machines, ['gone-machine'], { unassigned: true });
  assert.deepEqual(chips.map((c) => c.key), ['gone-machine', 'MONSTER', 'spacex', UNASSIGNED]); // case-insensitive A→Z, Unassigned last
  assert.deepEqual(chips.find((c) => c.key === 'gone-machine'), { key: 'gone-machine', count: 0, on: true });
  const states = chipsOf(fx.states, [], { order: fx.stateKeys });
  assert.deepEqual(states.map((c) => c.key), ['backlog', 'assigned', 'doing', 'done']);
  // An empty column still gets its chip (count 0) when the columns are passed as `always`.
  const few = facets(views.filter((v) => v.state !== 'done'), emptyFilter(), COLUMNS);
  const withEmpty = chipsOf(few.states, [], { order: few.stateKeys, always: few.stateKeys });
  assert.deepEqual(withEmpty.map((c) => [c.key, c.count]), [['backlog', 1], ['assigned', 2], ['doing', 2], ['done', 0]]);
});

test('toggleValue adds and removes without mutating', () => {
  const a = ['x'];
  const b = toggleValue(a, 'y');
  assert.deepEqual(a, ['x']);
  assert.deepEqual(b, ['x', 'y']);
  assert.deepEqual(toggleValue(b, 'x'), ['y']);
});

test('URL round trip: format → parse gives the same filter, handles with # survive encoding', () => {
  const f = { q: 'deploy now', machines: ['spacex'], agents: ['spacex/prg#2', 'MONSTER/birocode'], states: ['doing', 'assigned'], flags: ['blocked'], hide: true };
  const qs = formatFilter(f);
  assert.match(qs, /agent=spacex%2Fprg%232/);
  assert.match(qs, /machine=spacex/);
  assert.match(qs, /hide=1/);
  assert.deepEqual(parseFilter('?' + qs), normalizeFilter(f));
  assert.deepEqual(parseFilter(qs), normalizeFilter(f));
  // The documented shape from the task, typed by hand, parses too.
  assert.deepEqual(parseFilter('?machine=spacex&agent=spacex/prg%232&state=doing'), { ...emptyFilter(), machines: ['spacex'], agents: ['spacex/prg#2'], states: ['doing'] });
  // Comma lists and repeated keys both work.
  assert.deepEqual(parseFilter('?state=doing,done&state=todo').states, ['doing', 'done', 'todo']);
  // No filter key at all → null (fall back to the saved filter); an empty filter formats to "".
  assert.equal(parseFilter('?tab=kanban&layout=panes'), null);
  assert.equal(hasFilterParams('?tab=kanban'), false);
  assert.equal(hasFilterParams('?tab=kanban&state=doing'), true);
  assert.equal(formatFilter(emptyFilter()), '');
});

test('withFilterInUrl replaces only the filter keys and keeps the page\'s own params', () => {
  const href = 'http://host/api/localview/x/app/events-feed/manage/index.html?tab=kanban&state=done&layout=panes#top';
  const out = withFilterInUrl(href, { ...emptyFilter(), machines: ['spacex'], states: ['doing'] });
  const u = new URL(out);
  assert.equal(u.searchParams.get('tab'), 'kanban');
  assert.equal(u.searchParams.get('layout'), 'panes');
  assert.deepEqual(u.searchParams.getAll('state'), ['doing']);
  assert.deepEqual(u.searchParams.getAll('machine'), ['spacex']);
  assert.equal(u.hash, '#top');
  // Clearing the filter removes every filter key.
  const cleared = new URL(withFilterInUrl(out, emptyFilter()));
  assert.equal(cleared.search, '?tab=kanban&layout=panes');
});

test('the last filter is saved per browser and read back normalized; garbage reads as null', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  assert.equal(readSavedFilter(storage), null);
  writeSavedFilter(storage, { machines: ['spacex', ' spacex ', 7], states: ['doing'], hide: '1' });
  assert.deepEqual(readSavedFilter(storage), { ...emptyFilter(), machines: ['spacex'], states: ['doing'], hide: true });
  storage.setItem('claudeweb_task_filters', '{not json');
  assert.equal(readSavedFilter(storage), null);
});
