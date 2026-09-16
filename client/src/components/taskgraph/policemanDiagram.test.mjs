// openspec policeman-observes-agents: the explainer's diagrams are consistent (every edge
// names a known state) and render to SVG with one node per state and one arrow per edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_CHECK, LIFECYCLE, DRIVE, DRIVE_TABLE, PASS, CAN, CANNOT, PROVENANCE, toSvg, validate } from './policemanDiagram.js';

test('both state machines are consistent and cover the states the card knows', () => {
  for (const d of [BOARD_CHECK, LIFECYCLE, DRIVE]) {
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

test('the drive machine names every state the policeman must act in, each with one action', () => {
  const ids = DRIVE.states.map((s) => s.id);
  assert.deepEqual(ids, ['unassigned', 'waiting-arch', 'working', 'ahead', 'behind', 'stuck', 'skip', 'flagged', 'review']);
  for (const s of DRIVE.states) assert.ok(s.action && s.action.startsWith('→'), s.id + ' has no action');
  // Every state is reachable and the machine has no dead end except "not mine".
  const targets = new Set(DRIVE.edges.map((e) => e.to));
  const sources = new Set(DRIVE.edges.map((e) => e.from));
  for (const id of ids) if (id !== 'unassigned') assert.ok(targets.has(id), id + ' unreachable');
  for (const id of ids) if (id !== 'skip') assert.ok(sources.has(id), id + ' is a dead end');
  // The table covers the same states, one row each, with what it never does.
  assert.equal(DRIVE_TABLE.length, ids.length);
  for (const row of DRIVE_TABLE) assert.equal(row.length, 4);
  assert.ok(DRIVE_TABLE.some((r) => /demote/.test(r[3])) && DRIVE_TABLE.some((r) => /manual/.test(r[3])));
  const svg = toSvg(DRIVE);
  assert.equal((svg.match(/class="pd__action"/g) || []).length, ids.length);
  assert.ok(svg.includes('sync_card: the harness moves it'));
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
