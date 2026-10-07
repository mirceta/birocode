// node --test — the Subagents tab's pure half (openspec arch-subagents-tab): the dot
// state reuses the repo agents' palette with the same meanings, needs-human is the loop's
// escalate + needs-human reason, attention sorts first, the toolbar count is running +
// needs-human + armed, titles are the goal's first line, truncated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsHuman, subagentDot, subagentBadge, subagentTitle, sortSubagents, subagentList, subagentAttention, iterationsWord, lastActivityAt } from './subagents.js';

const conv = (id, extra = {}) => ({ id, name: `goal: ${id}`, isDefault: false, createdAt: 100, running: false, busy: false, goal: null, ...extra });
const goal = (extra = {}) => ({ id: 'g1', goal: 'Fix the exporter\n\nmore detail', state: 'running', loopStatus: 'looping', stopReason: null, stopDetail: null, iterations: 3, maxIterations: 12, lastSentAt: 500, startedAt: 100, endedAt: null, queued: 0, ...extra });

test('the dot speaks the repo agents\' palette: pulsing turn, amber needs-human, green armed, grey finished', () => {
  assert.equal(subagentDot(conv('a', { running: true, busy: true, goal: goal() })).state, 'running');
  const nh = conv('b', { goal: goal({ loopStatus: 'escalate', stopReason: 'needs-human', stopDetail: 'Which DB?' }) });
  assert.ok(needsHuman(nh));
  assert.equal(subagentDot(nh).state, 'claimed');
  assert.match(subagentDot(nh).label, /Which DB\?/);
  assert.equal(subagentDot(conv('c', { busy: true, goal: goal() })).state, 'free');
  assert.equal(subagentDot(conv('d', { goal: goal({ state: 'done', loopStatus: 'done' }) })).state, 'idle');
  assert.equal(subagentDot(conv('e', { goal: goal({ state: 'error', loopStatus: 'error', stopReason: 'error' }) })).state, 'unknown');
  assert.equal(subagentDot(conv('f')).state, 'idle'); // a plain sibling conversation
});

test('the badge always names the exact state', () => {
  assert.equal(subagentBadge(conv('a', { running: true })), 'busy');
  assert.equal(subagentBadge(conv('b', { goal: goal({ loopStatus: 'escalate', stopReason: 'needs-human' }) })), 'needs you');
  assert.equal(subagentBadge(conv('c', { busy: true, goal: goal() })), 'polling');
  assert.equal(subagentBadge(conv('d', { goal: goal({ state: 'capped' }) })), 'capped');
  assert.equal(subagentBadge(conv('f')), 'chat');
});

test('the title is the goal\'s first line, truncated; a plain conversation keeps its name', () => {
  assert.equal(subagentTitle(conv('a', { goal: goal() })), 'Fix the exporter');
  assert.equal(subagentTitle(conv('a', { goal: goal({ goal: 'x'.repeat(100) }) })).length, 80);
  assert.equal(subagentTitle(conv('f', { name: 'scratch chat' })), 'scratch chat');
});

test('attention sorts first, then last activity; the list drops the default conversation', () => {
  const list = [
    { id: 'default', isDefault: true },
    conv('old-done', { goal: goal({ state: 'done', loopStatus: 'done', lastSentAt: 200, endedAt: 300 }) }),
    conv('new-done', { goal: goal({ state: 'done', loopStatus: 'done', lastSentAt: 900, endedAt: 950 }) }),
    conv('turn', { running: true, busy: true, goal: goal({ lastSentAt: 50 }) }),
    conv('ask', { goal: goal({ loopStatus: 'escalate', stopReason: 'needs-human', stopDetail: '?', lastSentAt: 60 }) }),
    conv('armed', { busy: true, goal: goal({ lastSentAt: 400 }) }),
  ];
  const sorted = sortSubagents(subagentList(list)).map((c) => c.id);
  assert.deepEqual(sorted, ['ask', 'turn', 'armed', 'new-done', 'old-done']);
  assert.equal(subagentAttention(list), 3); // turn + ask + armed
});

test('iterations/cap and last activity read off the goal; blanks never throw', () => {
  assert.equal(iterationsWord(conv('a', { goal: goal() })), '3/12');
  assert.equal(iterationsWord(conv('f')), '');
  assert.equal(lastActivityAt(conv('a', { goal: goal({ endedAt: 999 }) })), 999);
  assert.equal(subagentAttention(null), 0);
  assert.equal(subagentDot(null).state, 'unknown');
});
