// node --test — the per-goal tabbed view helper (fleet task 93b481e6): tab list, the default
// when nothing is remembered, the blocked-step badge rule, and per-goal memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOAL_TABS, GOAL_TAB_KEYS, planBlocked, defaultTab, readGoalTab, writeGoalTab, resolveGoalTab } from './goalTabs.js';

test('the three tabs, in order', () => {
  assert.deepEqual(GOAL_TAB_KEYS, ['plan', 'chat', 'understanding']);
  assert.deepEqual(GOAL_TABS.map(([, l]) => l), ['Step plan', 'Chat', 'Understanding']);
});

test('planBlocked: a blocked or awaiting step needs the Operator', () => {
  assert.equal(planBlocked(null), false);
  assert.equal(planBlocked({ blockedSteps: 0, awaitsHuman: false }), false);
  assert.equal(planBlocked({ blockedSteps: 2 }), true);
  assert.equal(planBlocked({ awaitsHuman: true }), true);
  assert.equal(planBlocked({}), false);
});

test('defaultTab: Step plan when blocked, else Chat', () => {
  assert.equal(defaultTab({ blockedSteps: 1 }), 'plan');
  assert.equal(defaultTab({ awaitsHuman: true }), 'plan');
  assert.equal(defaultTab({ blockedSteps: 0 }), 'chat');
  assert.equal(defaultTab(null), 'chat');
});

test('readGoalTab: a valid remembered key, else null; invalid/absent → null', () => {
  const store = { 'manageapp.goalTab.g7': 'understanding', 'manageapp.goalTab.g8': 'sideways' };
  assert.equal(readGoalTab('g7', (k) => store[k] ?? null), 'understanding');
  assert.equal(readGoalTab('g8', (k) => store[k] ?? null), null); // invalid value ignored
  assert.equal(readGoalTab('g9', (k) => store[k] ?? null), null); // nothing remembered
  assert.equal(readGoalTab(null, () => { throw new Error('boom'); }), null);
});

test('writeGoalTab: only valid tabs are written, keyed per goal', () => {
  const store = {};
  const set = (k, v) => { store[k] = v; };
  writeGoalTab('g7', 'understanding', set);
  assert.equal(store['manageapp.goalTab.g7'], 'understanding');
  writeGoalTab('g7', 'bogus', set);
  assert.equal(store['manageapp.goalTab.g7'], 'understanding'); // unchanged
  writeGoalTab(null, 'chat', set);
  assert.equal(Object.keys(store).length, 1);
});

test('resolveGoalTab: the remembered choice wins, even over a now-blocked plan', () => {
  const blocked = { blockedSteps: 1 };
  // nothing remembered → default (plan, because blocked)
  assert.equal(resolveGoalTab('g1', blocked, () => null), 'plan');
  // remembered chat wins even though a step is blocked (the badge signals it instead)
  assert.equal(resolveGoalTab('g1', blocked, (k) => (k === 'manageapp.goalTab.g1' ? 'chat' : null)), 'chat');
  // not blocked, nothing remembered → chat
  assert.equal(resolveGoalTab('g2', { blockedSteps: 0 }, () => null), 'chat');
});
