// openspec policeman-observes-agents: the policeman's full state diagram is consistent —
// three nested levels (agent · pass · each card), every endpoint known, every state reachable,
// no dead end but the terminal ones, and the card level never moves a card backwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES, EDGES, SHAPES, WHO, LEVELS, levelElements, toElements, validate } from './policemanStateMachine.js';

test('the diagram validates and nests agent → pass → cards', () => {
  const v = validate();
  assert.equal(v.ok, true, v.problems.join('; '));
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  assert.equal(byId.pass.parent, 'agent');
  assert.equal(byId.cards.parent, 'pass');
  assert.ok(NODES.filter((n) => n.parent === 'agent' && n.kind === 'state').length >= 7);
  assert.equal(NODES.filter((n) => n.kind === 'step').length, 8);
  assert.equal(NODES.filter((n) => n.kind === 'card').length, 9);
});

test('the agent level covers start, stop, rollover, escalation, error and disarm', () => {
  const labels = EDGES.filter((e) => e.kind === 'lifecycle').map((e) => `${e.source}->${e.target}`);
  for (const must of ['off->armed', 'armed->pass', 'pass->armed', 'pass->wait', 'wait->armed', 'pass->rollover', 'rollover->armed', 'pass->errored', 'errored->armed', 'armed->stopped', 'stopped->armed', 'armed->paused', 'paused->armed', 'armed->armed']) {
    assert.ok(labels.includes(must), must);
  }
});

test('the pass level is the prompt’s order with its two inner loops, and points at the card level', () => {
  const flow = EDGES.filter((e) => e.kind === 'flow').map((e) => `${e.source}->${e.target}`);
  assert.deepEqual(flow.filter((f) => !/s4->s3|s6->s5/.test(f)), ['s1->s2', 's2->s3', 's3->s4', 's4->s5', 's5->s6', 's5->s7', 's7->s8']);
  assert.ok(flow.includes('s4->s3') && flow.includes('s6->s5'));
  assert.ok(EDGES.some((e) => e.kind === 'link' && e.source === 's4' && e.target === 'cards'));
});

test('flowchart shapes: pills at start and ends, parallelograms read, rectangles act, one diamond decides', () => {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  assert.equal(byId.off.shape, 'terminal');
  assert.equal(byId.s8.shape, 'terminal');
  assert.equal(byId['c-skip'].shape, 'terminal');
  assert.equal(byId.s4.shape, 'decision');
  for (const id of ['s1', 's2', 's3', 's5']) assert.equal(byId[id].shape, 'io', id);
  for (const id of ['s6', 's7']) assert.equal(byId[id].shape, 'process', id);
  for (const n of NODES) if (n.kind !== 'group') assert.ok(SHAPES[n.shape || 'state'], n.id + ' has an unknown shape');
  assert.ok(toElements().some((e) => e.data.id === 's4' && /shape-decision/.test(e.classes)));
});

test('each level is its own complete picture, with the nested level as one stand-in that links onward', () => {
  const count = (els) => ({ nodes: els.filter((e) => !e.data.source).length, edges: els.filter((e) => e.data.source).length, ref: els.find((e) => e.data.kind === 'ref') });
  const a = count(levelElements('agent'));
  assert.equal(a.nodes, 8); // 7 states + the PASS RUNNING stand-in
  assert.equal(a.edges, EDGES.filter((e) => e.kind === 'lifecycle').length); // every lifecycle edge survives, incl. those to/from the pass
  assert.equal(a.ref.data.to, 'pass');
  const p = count(levelElements('pass'));
  assert.equal(p.nodes, 9); // 8 steps + the EACH CARD stand-in
  assert.equal(p.edges, EDGES.filter((e) => e.kind === 'flow' || e.kind === 'link').length);
  assert.equal(p.ref.data.to, 'cards');
  const c = count(levelElements('cards'));
  assert.equal(c.nodes, 9);
  assert.equal(c.edges, EDGES.filter((e) => e.kind === 'card').length);
  assert.equal(c.ref, undefined);
  assert.deepEqual(Object.keys(LEVELS), ['agent', 'pass', 'cards']);
  assert.throws(() => levelElements('nope'));
});

test('who decides is pinned: the agent level is code or you, the step order is the prompt, facts are code, readings are the model', () => {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const edge = (s, t) => EDGES.find((e) => e.source === s && e.target === t);
  // The agent level: every state is harness-held; every transition is fired by code or by a human — never by the model,
  // except the one contract the model writes: NEEDS_HUMAN.
  for (const n of NODES.filter((n) => n.parent === 'agent' && n.kind === 'state')) assert.equal(n.who, 'code', n.id);
  for (const e of EDGES.filter((e) => e.kind === 'lifecycle')) assert.ok(e.who === 'code' || e.who === 'human' || (e.who === 'model' && e.target === 'wait'), e.id + ' is ' + e.who);
  assert.equal(edge('pass', 'rollover').who, 'code');
  assert.equal(edge('armed', 'armed').who, 'code');
  assert.equal(edge('off', 'armed').who, 'human');
  // The pass: the order is the prompt (every flow edge is model); reads are code; classify is the model;
  // the acting steps are mixed (the model calls, the code decides); the verdict is the model's text.
  for (const e of EDGES.filter((e) => e.kind === 'flow' || e.kind === 'link')) assert.equal(e.who, 'model', e.id);
  for (const id of ['s1', 's2', 's3', 's5']) assert.equal(byId[id].who, 'code', id);
  assert.equal(byId.s4.who, 'model');
  assert.equal(byId.s6.who, 'mixed');
  assert.equal(byId.s7.who, 'mixed');
  assert.equal(byId.s8.who, 'model');
  // Each card: facts-driven states are code; the readings are the model; flagging is mixed.
  for (const id of ['c-behind', 'c-ahead', 'c-skip', 'c-flagged', 'c-unassigned', 'c-waiting']) assert.equal(byId[id].who, 'code', id);
  assert.equal(byId['c-working'].who, 'model');
  assert.equal(byId['c-stuck'].who, 'mixed');
  assert.equal(edge('c-working', 'c-behind').who, 'code');
  assert.equal(edge('c-ahead', 'c-working').who, 'code');
  assert.equal(edge('c-ahead', 'c-stuck').who, 'model');
  assert.equal(edge('c-stuck', 'c-flagged').who, 'mixed');
  assert.equal(edge('c-flagged', 'c-working').who, 'human');
  assert.deepEqual(Object.keys(WHO), ['code', 'model', 'mixed', 'human']);
  // It is on the elements, as data and as a class, for both renderings.
  assert.ok(levelElements('pass').some((e) => e.data.id === 's4' && e.data.who === 'model' && /who-model/.test(e.classes)));
  assert.ok(levelElements('agent').some((e) => e.data.source === 'off' && e.data.who === 'human' && /who-human/.test(e.classes)));
});

test('cytoscape elements carry positions for states and none for groups', () => {
  const els = toElements();
  assert.equal(els.length, NODES.length + EDGES.length);
  const groups = els.filter((e) => e.data.kind === 'group');
  assert.ok(groups.every((g) => g.position === undefined));
  const states = els.filter((e) => e.data.kind && e.data.kind !== 'group' && !e.data.source);
  assert.ok(states.every((s) => Number.isFinite(s.position.x) && Number.isFinite(s.position.y)));
  assert.ok(els.some((e) => e.data.source === 'armed' && e.data.target === 'armed'), 'the self-loop is an element');
});
