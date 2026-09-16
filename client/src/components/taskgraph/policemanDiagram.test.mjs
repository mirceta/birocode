// openspec policeman-observes-agents: the explainer's diagrams are consistent (every edge
// names a known state) and render to SVG with one node per state and one arrow per edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_CHECK, LIFECYCLE, PASS, CAN, CANNOT, PROVENANCE, toSvg, validate } from './policemanDiagram.js';

test('both state machines are consistent and cover the states the card knows', () => {
  for (const d of [BOARD_CHECK, LIFECYCLE]) {
    const v = validate(d);
    assert.equal(v.ok, true, JSON.stringify(v.bad));
  }
  assert.deepEqual(BOARD_CHECK.states.map((s) => s.id), ['honest', 'unverified', 'needs-human', 'manual']);
  assert.deepEqual(LIFECYCLE.states.map((s) => s.id), ['todo', 'doing', 'committed', 'pr-opened', 'pr-merged', 'done']);
  // The policeman's forward move is drawn, and nothing goes backwards.
  const order = LIFECYCLE.states.map((s) => s.id);
  for (const e of LIFECYCLE.edges) assert.ok(order.indexOf(e.to) > order.indexOf(e.from), `${e.from}→${e.to} goes backwards`);
  assert.ok(LIFECYCLE.edges.some((e) => e.from === 'doing' && e.to === 'pr-opened' && /sync_card/.test(e.label)));
});

test('the SVG carries one node per state, one arrow per edge, and the labels', () => {
  const svg = toSvg(BOARD_CHECK);
  assert.match(svg, /^<svg class="pd" viewBox="0 0 860 430"/);
  assert.equal((svg.match(/data-state="/g) || []).length, 4);
  assert.equal((svg.match(/class="pd__edge"/g) || []).length, BOARD_CHECK.edges.length);
  assert.ok(svg.includes('Not verified yet'));
  assert.ok(svg.includes('you Resolve (policeman clears only its own)'));
  assert.ok(svg.includes('marker-end="url(#pd-arrow-board-check)"'));
  // Escaping: a quote or an ampersand in a label never breaks the markup.
  const x = toSvg({ id: 'x', title: 'a & "b"', width: 10, height: 10, states: [{ id: 's', x: 0, y: 0, w: 4, h: 4, label: '<l>', sub: '', tone: 'ok' }], edges: [] });
  assert.ok(x.includes('aria-label="a &amp; &quot;b&quot;"') && x.includes('&lt;l>'));
});

test('the prose tables are complete and name the withheld powers', () => {
  assert.equal(PASS.length, 6);
  assert.ok(PASS.some((p) => /observe_card/.test(p.tool)) && PASS.some((p) => /sync_card/.test(p.tool)));
  assert.ok(CAN.length >= 5 && CANNOT.length >= 5 && PROVENANCE.length >= 4);
  assert.ok(CANNOT.some(([w]) => /Dispatch/.test(w)) && CANNOT.some(([w]) => /Move by claim/.test(w)) && CANNOT.some(([w]) => /manual/.test(w)));
});
