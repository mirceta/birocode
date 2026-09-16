// openspec policeman-observes-agents: the policeman's full state diagram is consistent —
// three nested levels (agent · pass · each card), every endpoint known, every state reachable,
// no dead end but the terminal ones, and the card level never moves a card backwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES, EDGES, toElements, validate } from './policemanStateMachine.js';

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

test('cytoscape elements carry positions for states and none for groups', () => {
  const els = toElements();
  assert.equal(els.length, NODES.length + EDGES.length);
  const groups = els.filter((e) => e.data.kind === 'group');
  assert.ok(groups.every((g) => g.position === undefined));
  const states = els.filter((e) => e.data.kind && e.data.kind !== 'group' && !e.data.source);
  assert.ok(states.every((s) => Number.isFinite(s.position.x) && Number.isFinite(s.position.y)));
  assert.ok(els.some((e) => e.data.source === 'armed' && e.data.target === 'armed'), 'the self-loop is an element');
});
