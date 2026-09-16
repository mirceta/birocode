// openspec one-policeman: the policeman's state diagrams are consistent — four tabs (the parts ·
// the loop · each card · before), every endpoint known, every node reachable, no dead end but the
// terminal ones, the card level never moves a card backwards, and exactly ONE box of the loop is
// the model's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES, EDGES, SHAPES, WHO, LEVELS, levelElements, toElements, validate } from './policemanStateMachine.js';

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const edge = (s, t) => EDGES.find((e) => e.source === s && e.target === t);

test('the diagram validates and has four tabs', () => {
  const v = validate();
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.deepEqual(Object.keys(LEVELS), ['parts', 'loop', 'cards', 'before']);
  assert.throws(() => levelElements('nope'));
  for (const n of NODES) if (n.kind !== 'group') assert.ok(SHAPES[n.shape || 'state'], n.id + ' has an unknown shape');
  assert.deepEqual(Object.keys(WHO), ['code', 'model', 'mixed', 'human']);
});

test('the parts: one loop, one reader, settings, journal — in the policeman’s box; the arch, git & GitHub, the agents and the board outside', () => {
  assert.deepEqual(NODES.filter((n) => n.parent === 'policeman').map((n) => n.id), ['p-loop', 'p-reader', 'p-settings', 'p-journal']);
  for (const id of ['x-arch', 'x-github', 'x-agents', 'x-board']) assert.equal(byId[id].kind, 'outside', id);
  assert.equal(byId['p-reader'].who, 'model');
  for (const id of ['p-loop', 'p-settings', 'p-journal']) assert.equal(byId[id].who, 'code', id);
  assert.equal(edge('p-loop', 'p-reader').who, 'code', 'the code decides when to ask');
  assert.equal(edge('p-reader', 'p-loop').who, 'model', 'the answer is the model’s');
  assert.equal(edge('x-board', 'x-arch').who, 'human', 'your answer to a flag');
  const els = levelElements('parts');
  assert.equal(els.filter((e) => !e.data.source).length, 9); // the box + 4 parts + 4 outside
  assert.equal(els.find((e) => e.data.id === 'p-loop').data.parent, 'policeman');
  assert.equal(els.find((e) => e.data.id === 'x-board').data.parent, undefined);
});

test('the loop: one pass as a flowchart with exactly one model box, two decisions, a start pill and the next-card loop', () => {
  const loop = NODES.filter((n) => n.parent === 'loop');
  assert.equal(loop.length, 10);
  assert.deepEqual(loop.filter((n) => n.who === 'model').map((n) => n.id), ['m-ask']);
  assert.equal(byId['m-timer'].shape, 'terminal');
  assert.equal(byId['m-new'].shape, 'decision');
  assert.equal(byId['m-stuck'].shape, 'decision');
  assert.equal(byId['m-stuck'].who, 'mixed', 'code decides, informed by the reading');
  for (const id of ['m-trace', 'm-facts']) assert.equal(byId[id].shape, 'io', id);
  for (const id of ['m-move', 'm-ask', 'm-write', 'm-flag']) assert.equal(byId[id].shape, 'process', id);
  const flow = EDGES.filter((e) => e.kind === 'merge' && e.source.startsWith('m-')).map((e) => `${e.source}->${e.target}`);
  for (const must of ['m-timer->m-trace', 'm-trace->m-facts', 'm-facts->m-move', 'm-move->m-new', 'm-new->m-ask', 'm-ask->m-write', 'm-write->m-stuck', 'm-new->m-stuck', 'm-stuck->m-flag', 'm-stuck->m-next', 'm-flag->m-next', 'm-next->m-trace']) assert.ok(flow.includes(must), must);
  assert.equal(edge('m-ask', 'm-write').who, 'model');
  assert.equal(edge('m-new', 'm-ask').who, 'code', 'whether to ask is the code’s');
  const els = levelElements('loop');
  assert.equal(els.filter((e) => !e.data.source).length, 10);
  assert.equal(els.filter((e) => e.data.source).length, 12);
});

test('each card: nine states, never a move backwards, the flag is answered by you and cleared once the agent continues', () => {
  assert.equal(NODES.filter((n) => n.kind === 'card').length, 9);
  assert.equal(byId['c-skip'].shape, 'terminal');
  assert.equal(edge('c-flagged', 'c-working').who, 'human');
  assert.equal(edge('c-stuck', 'c-flagged').who, 'mixed');
  assert.equal(edge('c-working', 'c-behind').who, 'code');
  assert.equal(edge('c-ahead', 'c-stuck').who, 'code', 'two sweeps against the facts is a rule');
  const c = levelElements('cards');
  assert.equal(c.filter((e) => !e.data.source).length, 9);
  assert.equal(c.filter((e) => e.data.source).length, EDGES.filter((e) => e.kind === 'card').length);
});

test('before: the two checkers of old wrote on one card; folded into the one loop', () => {
  assert.deepEqual(NODES.filter((n) => n.parent === 'today').map((n) => n.id), ['t-check', 't-police', 't-card']);
  assert.deepEqual(NODES.filter((n) => n.parent === 'one').map((n) => n.id), ['n-loop']);
  assert.equal(byId['t-police'].who, 'model');
  assert.equal(byId['t-check'].who, 'code');
  assert.ok(edge('t-card', 'n-loop'));
  const els = levelElements('before');
  assert.equal(els.filter((e) => e.data.kind === 'group').length, 2);
  assert.equal(els.filter((e) => !e.data.source).length, 6);
});

test('cytoscape elements carry positions for nodes and none for groups; who is on every element as data and class', () => {
  const els = toElements();
  assert.equal(els.length, NODES.length + EDGES.length);
  assert.ok(els.filter((e) => e.data.kind === 'group').every((g) => g.position === undefined));
  assert.ok(els.filter((e) => e.data.kind && e.data.kind !== 'group' && !e.data.source).every((s) => Number.isFinite(s.position.x) && Number.isFinite(s.position.y)));
  assert.ok(levelElements('loop').some((e) => e.data.id === 'm-ask' && e.data.who === 'model' && /who-model/.test(e.classes)));
  assert.ok(levelElements('cards').some((e) => e.data.source === 'c-flagged' && e.data.who === 'human' && /who-human/.test(e.classes)));
});
