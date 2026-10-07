// node --test — the arch cached prompts' pure half (openspec arch-custom-prompts): placeholder
// parsing (both brace forms, JSON braces ignored), filling, chip kinds and pick lists, grouping
// in the panel's order, search, marks, reorder, preview, the append contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, placeholdersOf, hasPlaceholders, fillPlaceholder, placeholderKind, optionsFor, groupPrompts, filterPrompts, promptMark, moveId, preview, appendToDraft } from './archPrompts.js';

test('placeholders: {name} and {{ Name }} both count once each, in order; code braces never match', () => {
  assert.deepEqual(placeholdersOf('Update all harnesses except {machine}; tell {agent} and {machine} about {{ ticket id }}'), ['machine', 'agent', 'ticket id']);
  assert.deepEqual(placeholdersOf('run {"a":1} and ${VAR} and {Machine} and {}'), []);
  assert.equal(hasPlaceholders('plain text'), false);
  assert.deepEqual(placeholdersOf(null), []);
});

test('filling replaces every occurrence of one placeholder and leaves the others', () => {
  const t = 'Transfer {file} from {machine} to {machine} via the hub; tell {agent}.';
  const f = fillPlaceholder(t, 'machine', 'spacex');
  assert.equal(f, 'Transfer {file} from spacex to spacex via the hub; tell {agent}.');
  assert.equal(fillPlaceholder('see {{ ticket id }}', 'ticket id', '#12'), 'see #12');
  assert.deepEqual(placeholdersOf(f), ['file', 'agent']);
});

test('chip kinds come from the name; pick lists come from the arch state', () => {
  assert.equal(placeholderKind('machine'), 'machine');
  assert.equal(placeholderKind('agent'), 'agent');
  assert.equal(placeholderKind('repo'), 'agent');
  assert.equal(placeholderKind('task'), 'task');
  assert.equal(placeholderKind('pr'), 'pr');
  assert.equal(placeholderKind('url'), 'url');
  assert.equal(placeholderKind('branch'), 'branch');
  assert.equal(placeholderKind('n'), 'number');
  assert.equal(placeholderKind('text'), 'text');
  assert.equal(placeholderKind('what and why'), 'text');
  const ctx = {
    selfLabel: 'fotr', sources: [{ label: 'spacex', reachable: true }, { label: 'dark', reachable: false }],
    agents: [{ handle: 'fotr/birocode', branch: 'main', availability: 'available' }, { handle: 'spacex/prg', branch: 'feat/x', availability: 'busy' }, { handle: 'spacex/prg2', branch: 'feat/x' }],
    tasks: [{ id: 'abcdef0123456789', title: 'Ship it', status: 'doing' }],
  };
  assert.deepEqual(optionsFor('machine', ctx).map((o) => o.value), ['fotr', 'spacex', 'dark']);
  assert.match(optionsFor('machine', ctx)[2].label, /unreachable/);
  assert.deepEqual(optionsFor('agent', ctx).map((o) => o.value), ['fotr/birocode', 'spacex/prg', 'spacex/prg2']);
  assert.deepEqual(optionsFor('branch', ctx).map((o) => o.value), ['main', 'feat/x']);
  assert.deepEqual(optionsFor('task', ctx), [{ value: 'abcdef01', label: 'abcdef01 · Ship it · doing' }]);
  assert.deepEqual(optionsFor('pr', ctx), []);
  assert.deepEqual(optionsFor('machine', null), []);
});

test('grouping follows the panel order, unknown categories after, empty groups dropped', () => {
  const ps = [
    { id: '1', category: 'Agents', label: 'a' }, { id: '2', category: 'Deploy & fleet', label: 'b' },
    { id: '3', category: 'My own', label: 'c' }, { id: '4', category: '', label: 'd' }, { id: '5', category: 'Agents', label: 'e' },
  ];
  const g = groupPrompts(ps);
  assert.deepEqual(g.map((x) => x.name), ['Deploy & fleet', 'Agents', 'My own', 'Other']);
  assert.deepEqual(g[1].items.map((p) => p.id), ['1', '5']);
  assert.equal(GROUPS.length, 6);
  assert.deepEqual(groupPrompts([]), []);
});

test('search matches every word across label, text, category and hint; marks and reorder', () => {
  const ps = [
    { id: '1', label: 'Redeploy hub', text: 'Pull main and redeploy', category: 'Deploy & fleet', seedId: 'redeploy-hub', edited: false },
    { id: '2', label: 'Free agents', text: 'Which agents are free?', category: 'Agents', hint: 'name the family', seedId: 'agents-status', edited: true },
    { id: '3', label: 'Mine', text: 'custom', category: 'Agents' },
  ];
  assert.deepEqual(filterPrompts(ps, 'redeploy main').map((p) => p.id), ['1']);
  assert.deepEqual(filterPrompts(ps, 'family').map((p) => p.id), ['2']);
  assert.deepEqual(filterPrompts(ps, 'agents').map((p) => p.id), ['2', '3']);
  assert.equal(filterPrompts(ps, '').length, 3);
  assert.equal(promptMark(ps[0]), 'seeded');
  assert.equal(promptMark(ps[1]), 'edited');
  assert.equal(promptMark(ps[2]), 'custom');
  assert.deepEqual(moveId(['1', '2', '3'], '3', -1), ['1', '3', '2']);
  assert.deepEqual(moveId(['1', '2', '3'], '1', -1), ['1', '2', '3']);
  assert.deepEqual(moveId(['1', '2', '3'], 'x', 1), ['1', '2', '3']);
});

test('preview collapses whitespace and truncates; append keeps the draft', () => {
  assert.equal(preview('a   b\n\nc'), 'a b c');
  assert.equal(preview('x'.repeat(200), 20).length, 20);
  assert.equal(appendToDraft('', 'hello'), 'hello');
  assert.equal(appendToDraft('first ', 'second'), 'first\n\nsecond');
});
