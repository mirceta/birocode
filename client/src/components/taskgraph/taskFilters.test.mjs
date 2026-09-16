// openspec task-filters: the shared filter model — AND across groups, OR within, the
// Unassigned chips, faceted counts, the URL round trip (bookmarkable), the saved
// filter, agent handles with the numeric-suffix fallback, and state chips that follow
// the board's columns (the delivery lifecycle, openspec kanban-lifecycle-columns).
// Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNASSIGNED, emptyFilter, isNarrowed, toggleValue, normalizeFilter, hasFilterParams, parseFilter, formatFilter,
  withFilterInUrl, readSavedFilter, writeSavedFilter, agentHandles, filterContext, taskView, matchesTask, applyFilter,
  facets, chipsOf, blockedIds, staleIds, flagsOf, assigneesOf,
} from './taskFilters.js';
import { COLUMNS, STATUS_KEYS, columnOf } from './kanbanColumns.js';

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
const edges = [{ id: 'e1', source: 'b', target: 'e' }]; // b waits on e (todo, not delivered) → b blocked
const ctx = filterContext(fleet, columnOf);
const blocked = blockedIds(nodes, edges);
const views = nodes.map((n) => taskView(n, ctx, flagsOf(n.id, blocked, null)));
const byId = Object.fromEntries(views.map((v) => [v.id, v]));

test('the columns are the delivery lifecycle and columnOf reads a task status', () => {
  assert.deepEqual(STATUS_KEYS, ['todo', 'doing', 'committed', 'pr-opened', 'pr-merged', 'done']);
  assert.equal(columnOf({ status: 'pr-opened' }), 'pr-opened');
  assert.equal(columnOf({ status: 'weird' }), 'todo');
  assert.equal(columnOf(null), 'todo');
});

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
  assert.equal(byId.b.state, 'todo');
  assert.deepEqual(byId.b.flags, ['blocked']);
  assert.equal(byId.e.machine, null);
  assert.equal(byId.e.agent, null);
  assert.equal(byId.e.state, 'todo');
  // An assignee the fleet no longer knows keeps a readable, stable handle.
  assert.equal(byId.f.agent, 'spacex/gone-rep');
  assert.equal(byId.f.machine, 'spacex');
});

test('blocked follows the delivered rule: a merged prerequisite unblocks, an open PR does not', () => {
  const ns = [
    { id: 'x', status: 'todo' }, { id: 'p', status: 'pr-opened' },
    { id: 'y', status: 'todo' }, { id: 'q', status: 'pr-merged' },
    { id: 'z', status: 'pr-merged' }, { id: 'r', status: 'todo' },
  ];
  const es = [{ id: '1', source: 'x', target: 'p' }, { id: '2', source: 'y', target: 'q' }, { id: '3', source: 'z', target: 'r' }];
  assert.deepEqual([...blockedIds(ns, es)], ['x']); // y's prerequisite is merged; z is itself delivered
});

test('stale = committed / pr-opened with no activity past the window', () => {
  const now = 1_000_000_000;
  const h = 3600e3;
  const ns = [
    { id: 'old-c', status: 'committed', updatedAt: now - 30 * h },
    { id: 'new-c', status: 'committed', updatedAt: now - 2 * h },
    { id: 'old-pr', status: 'pr-opened', updatedAt: now - 25 * h },
    { id: 'old-doing', status: 'doing', updatedAt: now - 90 * h },
  ];
  assert.deepEqual([...staleIds(ns, 24 * h, now)], ['old-c', 'old-pr']);
  assert.equal(staleIds(ns, 0, now).size, 0);
  assert.deepEqual(flagsOf('old-c', new Set(['old-c']), staleIds(ns, 24 * h, now)), ['blocked', 'stale']);
});

test('empty filter shows everything; OR within a group; AND across groups', () => {
  const f = emptyFilter();
  assert.equal(applyFilter(views, f).size, views.length);
  assert.equal(isNarrowed(f), false);

  const machines = { ...f, machines: ['MONSTER', 'spacex'] };
  assert.deepEqual([...applyFilter(views, machines)].sort(), ['a', 'b', 'c', 'd', 'f']);

  const both = { ...f, machines: ['spacex'], states: ['todo'] };
  assert.deepEqual([...applyFilter(views, both)], ['c']);

  const agentAndState = { ...f, agents: ['MONSTER/birocode'], states: ['committed'] };
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
  assert.deepEqual([...applyFilter(views, { ...emptyFilter(), q: 'spacex todo' })], ['c']);
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
  assert.equal(fx.states.get('todo'), 1);
  assert.equal(fx.states.get('done'), 1);
  assert.equal(fx.states.get('doing'), 1);
  assert.equal(fx.states.get('committed') || 0, 0);
  assert.deepEqual(fx.stateKeys, STATUS_KEYS);
  assert.deepEqual(fx.flagKeys, ['blocked']); // no task is stale → no stale chip
  assert.equal(fx.total, 6);
  assert.equal(fx.shown, 3);

  // A state reported by columnOf that the column list does not know appears after the known ones.
  const future = [...views, { id: 'z', title: 'QA', machine: null, agent: null, state: 'qa', flags: [], text: 'qa' }];
  assert.deepEqual(facets(future, emptyFilter(), COLUMNS).stateKeys, [...STATUS_KEYS, 'qa']);
  assert.deepEqual(facets(views, emptyFilter(), COLUMNS).flagKeys, ['blocked']);
  assert.deepEqual(facets(views, { ...emptyFilter(), flags: ['stale'] }, COLUMNS).flagKeys, ['blocked', 'stale']);
});

test('chips list every key with its count, keep a selected key that vanished, Unassigned last', () => {
  const fx = facets(views, emptyFilter(), COLUMNS);
  const chips = chipsOf(fx.machines, ['gone-machine'], { unassigned: true });
  assert.deepEqual(chips.map((c) => c.key), ['gone-machine', 'MONSTER', 'spacex', UNASSIGNED]); // case-insensitive A→Z, Unassigned last
  assert.deepEqual(chips.find((c) => c.key === 'gone-machine'), { key: 'gone-machine', count: 0, on: true });
  // Every column gets its chip, in column order, even when empty (count 0).
  const states = chipsOf(fx.states, [], { order: fx.stateKeys, always: fx.stateKeys });
  assert.deepEqual(states.map((c) => [c.key, c.count]), [['todo', 3], ['doing', 2], ['committed', 0], ['pr-opened', 0], ['pr-merged', 0], ['done', 1]]);
});

test('a multi-assignee task matches a machine or agent chip when ANY assignee matches, and counts once per key', () => {
  // openspec task-multi-assignee: prg on spacex + birocode on MONSTER own one card.
  const multi = { id: 'm', title: 'DLL-mode invoice lock', status: 'doing', repoId: 'p1', sourceId: 'src-spacex',
    assignees: [{ sourceId: 'src-spacex', repoId: 'p1', status: 'doing' }, { sourceId: null, repoId: 'r-web', status: 'todo' }] };
  assert.deepEqual(assigneesOf(multi).map((a) => a.repoId), ['p1', 'r-web']);
  assert.deepEqual(assigneesOf(nodes[0]).map((a) => a.repoId), ['r-web']);          // legacy single
  assert.deepEqual(assigneesOf(nodes[4]), []);                                        // unassigned
  const v = taskView(multi, ctx, []);
  assert.deepEqual(v.machines, ['spacex', 'MONSTER']);
  assert.deepEqual(v.agents, ['spacex/prg', 'MONSTER/birocode']);
  assert.equal(v.machine, 'spacex');                                                 // the primary, for single-value readers
  const all = [...views, v];
  assert.deepEqual([...applyFilter(all, { ...emptyFilter(), machines: ['MONSTER'] })].sort(), ['a', 'b', 'm']);
  assert.deepEqual([...applyFilter(all, { ...emptyFilter(), agents: ['spacex/prg'] })].sort(), ['c', 'm']);
  assert.deepEqual([...applyFilter(all, { ...emptyFilter(), machines: [UNASSIGNED] })], ['e']);
  assert.equal(matchesTask(v, { ...emptyFilter(), machines: ['spacex'], agents: ['MONSTER/birocode'] }), true); // AND across groups, any assignee within
  const fx = facets(all, emptyFilter(), COLUMNS);
  assert.equal(fx.machines.get('spacex'), 4);   // c, d, f + the multi card once
  assert.equal(fx.machines.get('MONSTER'), 3);  // a, b + the multi card once
  assert.equal(fx.agents.get('spacex/prg'), 2);
});

test('toggleValue adds and removes without mutating', () => {
  const a = ['x'];
  const b = toggleValue(a, 'y');
  assert.deepEqual(a, ['x']);
  assert.deepEqual(b, ['x', 'y']);
  assert.deepEqual(toggleValue(b, 'x'), ['y']);
});

test('URL round trip: format → parse gives the same filter, handles with # survive encoding', () => {
  const f = { q: 'deploy now', machines: ['spacex'], agents: ['spacex/prg#2', 'MONSTER/birocode'], states: ['doing', 'pr-opened'], flags: ['blocked'], hide: true };
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
