// openspec recurring-tasks: the Recurring tab's pure half — card order (attention first,
// paused last), the words on a card (next run / held why / goal-loop phase), the editor
// form ⇄ API body round trip and its validation.
// Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentKey, agentOptions, inWords, agoWords, nextLine, orderCards, attentionCount, summaryLine, loopWord,
  blankForm, formOf, bodyOf, validateForm, sameForm, errorText, tookWords } from './recurringCards.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const task = (o = {}) => ({ id: 'a', title: 'A', enabled: true, pausedReason: null, nextDueAt: NOW + 30 * MIN, hold: null, running: null, attention: null, ...o });

test('assignee options come from the fleet status, keyed like the board', () => {
  const fleet = { machines: [
    { machine: 'hub', self: true, sourceId: 'self', reachable: true, agents: [{ repoId: 'r1', name: 'birocode', handle: 'hub/birocode', managed: true, runningSince: 5 }] },
    { machine: 'spacex', self: false, sourceId: 'src-a', reachable: true, agents: [{ repoId: 'r2', name: 'prg' }] },
  ] };
  const o = agentOptions(fleet);
  assert.deepEqual(o.map((x) => [x.key, x.sourceId, x.label, x.busy]), [['|r1', null, 'hub/birocode 🏛', true], ['src-a|r2', 'src-a', 'spacex/prg', false]]);
  assert.equal(agentKey(null, 'r1'), '|r1');
});

test('time words', () => {
  assert.equal(inWords(40_000), 'in 40 s');
  assert.equal(inWords(34 * MIN), 'in 34 min');
  assert.equal(inWords(13 * 60 * MIN + 12 * MIN), 'in 13 h 12 min');
  assert.equal(inWords(2 * 60 * MIN), 'in 2 h');
  assert.equal(agoWords(NOW - 7 * MIN, NOW), '7 min ago');
  assert.equal(tookWords({ armedAt: NOW, endedAt: NOW + 48_000 }), '48 s');
  assert.equal(tookWords({ armedAt: NOW, endedAt: NOW + 4 * MIN }), '4 min');
});

test('the card line: next run, held with the reason, the goal loop\'s phase, paused', () => {
  assert.deepEqual(nextLine(task(), NOW), { kind: 'next', text: 'next run in 30 min' });
  const held = nextLine(task({ nextDueAt: null, hold: { dueAt: NOW - 7 * MIN, missed: 2, reason: "the agent's loop slot is in use (operator's loop) — it runs when that ends" } }), NOW);
  assert.equal(held.kind, 'hold');
  assert.match(held.text, /^due 7 min ago — held: the agent's loop slot is in use/);
  assert.match(held.text, /covers 2 earlier/);
  assert.deepEqual(nextLine(task({ running: { mode: 'goal', phase: 'verify', turns: 3 } }), NOW), { kind: 'running', text: 'goal loop · turn 3', phase: 'verify', turns: 3 });
  assert.equal(nextLine(task({ running: { mode: 'single' } }), NOW).phase, null);
  assert.equal(nextLine(task({ enabled: false, pausedReason: 'auto: 3 consecutive failures' }), NOW).text, 'paused — auto: 3 consecutive failures');
  assert.equal(nextLine(task({ enabled: false, pausedReason: 'operator' }), NOW).text, 'paused — by the Operator');
});

test('cards: attention first, then running/held, then by next run, paused last', () => {
  const list = [
    task({ id: 'later', title: 'later', nextDueAt: NOW + 120 * MIN }),
    task({ id: 'paused', title: 'paused', enabled: false, nextDueAt: null }),
    task({ id: 'soon', title: 'soon', nextDueAt: NOW + 5 * MIN }),
    task({ id: 'attn', title: 'attn', attention: 'attention', nextDueAt: NOW + 300 * MIN }),
    task({ id: 'held', title: 'held', nextDueAt: null, hold: { dueAt: NOW, missed: 0, reason: 'busy' } }),
    task({ id: 'selfpaused', title: 'selfpaused', enabled: false, attention: 'failed', nextDueAt: null }),
  ];
  assert.deepEqual(orderCards(list).map((t) => t.id), ['attn', 'held', 'soon', 'later', 'selfpaused', 'paused']);
  assert.equal(attentionCount(list), 2);
  assert.equal(summaryLine(list, NOW), '4 active · 2 paused · 2 need attention · next run in 5 min');
  assert.equal(summaryLine([], NOW), '0 active');
});

test('how a run\'s loop ended, in words', () => {
  assert.equal(loopWord({ mode: 'goal', status: 'done', stopReason: 'verified' }), 'verified ✓');
  assert.equal(loopWord({ mode: 'goal', status: 'running', phase: 'verify' }), 'verify…');
  assert.equal(loopWord({ mode: 'goal', status: 'escalated' }), 'needs-human');
  assert.equal(loopWord({ mode: 'goal', status: 'capped' }), 'turn budget reached');
  assert.equal(loopWord({ mode: 'goal', status: 'error', stopReason: 'no-reply' }), 'error · no-reply');
  assert.equal(loopWord({ mode: 'goal', status: 'refused' }), '—');
  assert.equal(loopWord({ mode: 'single', status: 'done' }), 'one prompt');
});

test('the form round-trips a task and builds the API body', () => {
  const t = { title: 'CI', sourceId: 'src-a', repoId: 'r2', instructions: 'look', schedule: { kind: 'interval', everyMinutes: 120 },
    run: { mode: 'goal', maxTurns: 6 }, policy: { catchUp: true, skipWhenBusy: false, skipAbovePlanUsage: 85, requireDefaultBranch: false } };
  const f = formOf(t);
  assert.deepEqual([f.every, f.unit, f.agent], [2, 'h', 'src-a|r2']);
  assert.deepEqual(bodyOf(f), { title: 'CI', sourceId: 'src-a', repoId: 'r2', instructions: 'look', schedule: t.schedule, run: t.run, policy: t.policy });
  assert.ok(sameForm(f, formOf(t)));
  assert.ok(!sameForm(f, { ...f, every: 3 }));
  assert.deepEqual(formOf({ ...t, schedule: { kind: 'interval', everyMinutes: 90 } }).unit, 'min');
  const daily = bodyOf({ ...blankForm('|r1'), title: 'Drift', instructions: 'x', scheduleKind: 'daily', at: '07:00', days: ['Friday', 'Monday'] });
  assert.deepEqual(daily.schedule, { kind: 'daily', at: '07:00', days: ['Monday', 'Friday'] });   // week order
  assert.equal(daily.sourceId, null);                                                            // "" = this machine
});

test('validation says what is missing', () => {
  const ok = { ...blankForm('|r1'), title: 'T', instructions: 'do' };
  assert.equal(validateForm(ok), null);
  assert.match(validateForm({ ...ok, title: ' ' }), /title/);
  assert.match(validateForm({ ...ok, agent: '' }), /repo agent/);
  assert.match(validateForm({ ...ok, instructions: '' }), /goal of every run/);
  assert.match(validateForm({ ...ok, every: 2, unit: 'min' }), /at least 5 minutes/);
  assert.match(validateForm({ ...ok, scheduleKind: 'daily', at: '7am' }), /HH:mm/);
  assert.match(validateForm({ ...ok, maxTurns: 1 }), /2–30/);
});

test('API errors read as the server\'s sentence', () => {
  assert.equal(errorText(new Error('{"error":"the agent is busy — try again when its turn ends"}')), 'the agent is busy — try again when its turn ends');
  assert.equal(errorText(new Error('plain')), 'plain');
});
