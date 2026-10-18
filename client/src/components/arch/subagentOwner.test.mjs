// node --test — the Subagents panel's owner model (openspec repo-agent-subagents).
import test from 'node:test';
import assert from 'node:assert/strict';
import { archOwner, repoOwner, subagentRow, subagentCounts, subagentBadgeWord } from './subagentOwner.js';
import { subagentList, subagentDot, subagentBadge, subagentAttention, needsHuman } from './subagents.js';
import { progressWord, awaitingStep } from './goalPlan.js';

test('the arch owner keeps every path the Management tab used', () => {
  assert.equal(archOwner.listPath, '/arch/conversations');
  assert.equal(archOwner.goalPath('g1', 'stop'), '/arch/goals/g1/stop');
  assert.equal(archOwner.stepPath('g1', 2), '/arch/goals/g1/steps/2');
  assert.equal(archOwner.storageKey('subagent'), 'manageapp.subagent');
  assert.deepEqual(archOwner.rowsOf({ conversations: [{ id: 'a' }] }), [{ id: 'a' }]);
  assert.equal(archOwner.rowsOf({}), null);
});

test('a repo owner speaks /api/goal-conversations and keeps its own selection per repo', () => {
  const o = repoOwner('r 1', 'prg');
  assert.equal(o.listPath, '/goal-conversations?repo=r%201');
  assert.equal(o.goalPath('ab12', 'answer'), '/goal-conversations/ab12/answer');
  assert.equal(o.stepPath('ab12', 3), '/goal-conversations/ab12/steps/3');
  assert.equal(o.storageKey('subagent'), 'dock.subagent.r 1');
  assert.match(o.emptyText, /prg starts one with its start_goal_conversation tool/);
});

const view = (over = {}) => ({
  id: 'ab12', name: 'run tests', goal: 'Run the tests', state: 'running', busy: true, running: false, held: false,
  loopStatus: 'looping', stopReason: null, stopDetail: null, iterations: 1, maxIterations: 10, startedAt: 5, lastSentAt: 9,
  plan: [{ index: 1, title: 'build', state: 'done' }, { index: 2, title: 'test', state: 'active' }], progress: { done: 1, total: 2 }, ...over,
});

test('a subagent view becomes a row the shared panel helpers read', () => {
  const row = subagentRow(view());
  assert.equal(row.isDefault, false);
  assert.equal(row.goal.id, 'ab12');
  assert.equal(row.goal.goal, 'Run the tests');
  assert.equal(subagentList([row]).length, 1);
  assert.equal(subagentDot(row).state, 'free');
  assert.equal(subagentBadge(row), 'polling');
  assert.equal(progressWord(row.goal), '1/2');
  assert.equal(subagentAttention([row]), 1);
  const running = subagentRow(view({ running: true }));
  assert.equal(subagentDot(running).state, 'running');
});

test('a held subagent reads as needs-you with its question', () => {
  const row = subagentRow(view({ busy: false, held: true, loopStatus: 'escalate', stopReason: 'needs-human', stopDetail: 'which DB?',
    plan: [{ index: 1, title: 'ask', state: 'blocked', awaitsHuman: true, note: 'which DB?' }] }));
  assert.equal(needsHuman(row), true);
  assert.equal(subagentDot(row).state, 'claimed');
  assert.equal(awaitingStep(row.goal).note, 'which DB?');
});

test('counts and the chip word', () => {
  const c = subagentCounts([view(), view({ id: 'x', state: 'done', busy: false }), view({ id: 'y', held: true, running: true })]);
  assert.deepEqual(c, { running: 2, busy: 1, needsHuman: 1, total: 3 });
  assert.equal(subagentBadgeWord({ running: 2, total: 3, needsHuman: 1 }), '⑂ 2 goal conversations · 1 waiting');
  assert.equal(subagentBadgeWord({ running: 1, total: 1, needsHuman: 0 }), '⑂ 1 goal conversation');
  assert.equal(subagentBadgeWord({ running: 0, total: 4 }), '⑂ 4 ended');
  assert.equal(subagentBadgeWord(null), '');
  assert.equal(subagentBadgeWord({ total: 0 }), '');
});
