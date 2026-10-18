import test from 'node:test';
import assert from 'node:assert/strict';
import { currentView, autoName, capture, updateFrom, rename, applyPlan, isModified, move, cleanList, mergeBrowserWins, shortcutOf, sameList } from './viewPresets.js';

const TABS = ['arch', 'subagents', 'kanban', 'status', 'memory'];
const labels = { arch: 'Arch agent', subagents: 'Subagents 3', kanban: 'Kanban', status: 'Status', memory: 'Memory' };
const labelOf = (k) => labels[k];

test('the current view is the visible panes in order with fractional dividers', () => {
  const v = currentView({ layout: 'panes', wide: true, tab: 'arch', order: ['status', 'kanban', 'arch', 'subagents', 'memory'], hidden: ['arch', 'memory'], weights: { status: 1, kanban: 1, subagents: 2 } });
  assert.deepEqual(v.panes, ['status', 'kanban', 'subagents']);
  assert.deepEqual(v.fractions, [0.25, 0.25, 0.5]);
  assert.deepEqual(currentView({ layout: 'tabs', tab: 'memory', order: TABS, hidden: [], weights: {} }), { panes: ['memory'], fractions: [1] });
  // panes chosen but the window too narrow: what is on screen is the single tab
  assert.deepEqual(currentView({ layout: 'panes', wide: false, tab: 'kanban', order: TABS, hidden: [], weights: {} }).panes, ['kanban']);
});

test('a captured preset is auto-named "A | B | C" without badge counts, and keeps the Subagents selection', () => {
  const p = capture({ panes: ['status', 'kanban', 'subagents'], fractions: [0.2, 0.3, 0.5] }, { labelOf, sel: 'c1', now: 5, id: 'x' });
  assert.equal(p.name, 'Status | Kanban | Subagents');
  assert.equal(p.auto, true);
  assert.deepEqual(p.panes, [{ tab: 'status' }, { tab: 'kanban' }, { tab: 'subagents', sel: 'c1' }]);
  assert.equal(autoName(['kanban'], labelOf), 'Kanban');
});

test('rename sticks through update-from-view; an auto name follows the view', () => {
  const p = capture({ panes: ['status', 'kanban'], fractions: [0.5, 0.5] }, { labelOf, now: 1, id: 'x' });
  const auto = updateFrom(p, { panes: ['memory', 'kanban'], fractions: [0.4, 0.6] }, { labelOf, now: 2 });
  assert.equal(auto.name, 'Memory | Kanban');
  assert.equal(auto.created, 1);
  const named = rename(p, '  Morning  ', 3);
  assert.equal(named.name, 'Morning');
  assert.equal(updateFrom(named, { panes: ['memory'], fractions: [1] }, { labelOf }).name, 'Morning');
  assert.equal(rename(p, '   ').name, p.name);
});

test('applying a preset opens exactly its panes, in order, with its divider fractions', () => {
  const p = { id: 'x', name: 'n', panes: [{ tab: 'status' }, { tab: 'kanban' }, { tab: 'subagents', sel: 'c9' }], fractions: [0.2, 0.3, 0.5] };
  const plan = applyPlan(p, TABS, ['arch', 'memory', 'subagents', 'kanban', 'status']);
  assert.equal(plan.layout, 'panes');
  assert.deepEqual(plan.order, ['status', 'kanban', 'subagents', 'arch', 'memory']);
  assert.deepEqual(plan.hidden, ['arch', 'memory']);
  assert.ok(Math.abs(plan.weights.status - 0.6) < 1e-9 && Math.abs(plan.weights.subagents - 1.5) < 1e-9);
  assert.equal(plan.sel, 'c9');
  assert.deepEqual(plan.missing, []);
  const one = applyPlan({ id: 'y', name: 'm', panes: [{ tab: 'memory' }], fractions: [1] }, TABS);
  assert.equal(one.layout, 'tabs');
  assert.equal(one.tab, 'memory');
});

test('a tab that no longer exists is skipped and reported; the rest share its space', () => {
  const plan = applyPlan({ id: 'x', name: 'n', panes: [{ tab: 'gone' }, { tab: 'status' }, { tab: 'kanban' }], fractions: [0.5, 0.25, 0.25] }, TABS);
  assert.deepEqual(plan.missing, ['gone']);
  assert.deepEqual(plan.order.slice(0, 2), ['status', 'kanban']);
  assert.equal(plan.weights.status, 1);
  assert.equal(applyPlan({ id: 'z', name: 'n', panes: [{ tab: 'gone' }], fractions: [1] }, TABS).empty, true);
});

test('modified = a pane added, removed, reordered, or a divider moved by more than 1%', () => {
  const p = { id: 'x', name: 'n', panes: [{ tab: 'status' }, { tab: 'kanban' }], fractions: [0.4, 0.6] };
  assert.equal(isModified(p, { panes: ['status', 'kanban'], fractions: [0.405, 0.595] }, TABS), false);
  assert.equal(isModified(p, { panes: ['status', 'kanban'], fractions: [0.5, 0.5] }, TABS), true);
  assert.equal(isModified(p, { panes: ['kanban', 'status'], fractions: [0.6, 0.4] }, TABS), true);
  assert.equal(isModified(p, { panes: ['status', 'kanban', 'memory'], fractions: [0.3, 0.4, 0.3] }, TABS), true);
  assert.equal(isModified(null, { panes: [], fractions: [] }, TABS), false);
});

test('reorder, clean and the browser-wins sync', () => {
  const a = { id: 'a', name: 'A', panes: [{ tab: 'arch' }], fractions: [1] };
  const b = { id: 'b', name: 'B', panes: [{ tab: 'status' }], fractions: [1] };
  const c = { id: 'c', name: 'C', panes: [{ tab: 'memory' }], fractions: [1] };
  assert.deepEqual(move([a, b, c], 'c', -1).map((p) => p.id), ['a', 'c', 'b']);
  assert.deepEqual(move([a, b], 'a', -1).map((p) => p.id), ['a', 'b']);
  assert.deepEqual(cleanList([a, a, { id: 'bad' }, null, b]).map((p) => p.id), ['a', 'b']);
  const hubA = { ...a, name: 'A on the hub' };
  const merged = mergeBrowserWins([a, b], [hubA, c]);
  assert.deepEqual(merged.map((p) => p.name), ['A', 'B', 'C']);
  assert.equal(sameList([a, b], [a, b]), true);
  assert.equal(sameList([a, b], [b, a]), false);
});

test('shortcuts: Alt+1..9 switch, Alt+Shift+S save, Ctrl combos left to the browser', () => {
  assert.deepEqual(shortcutOf({ altKey: true, code: 'Digit3', key: '3' }), { index: 2 });
  assert.deepEqual(shortcutOf({ altKey: true, shiftKey: true, code: 'KeyS', key: 'S' }), { save: true });
  assert.equal(shortcutOf({ ctrlKey: true, code: 'Digit1', key: '1' }), null);
  assert.equal(shortcutOf({ altKey: true, ctrlKey: true, code: 'Digit1', key: '1' }), null);
  assert.equal(shortcutOf({ altKey: true, code: 'Digit0', key: '0' }), null);
});
