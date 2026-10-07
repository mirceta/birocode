// node --test — the goal step plan's pure half (openspec goal-step-plan): progress counts
// done + skipped, blocked and awaiting steps are found, the state words, evidence lines,
// the headline and the continue rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planOf, planProgress, progressWord, blockedSteps, hasBlockedStep, awaitingStep, activeStep, stateWords, kindWord, evidenceLines, nextStates, planHeadline, canContinue } from './goalPlan.js';

const step = (index, state, extra = {}) => ({ index, title: `step ${index}`, done: null, kind: 'send', state, note: null, evidence: null, counter: 0, updatedAt: 0, awaitsHuman: false, ...extra });
const goal = (plan, extra = {}) => ({ id: 'g1', state: 'running', plan, ...extra });

test('progress counts done and skipped over the total, from the server figure when given', () => {
  const g = goal([step(1, 'done'), step(2, 'skipped'), step(3, 'active'), step(4, 'pending')]);
  assert.deepEqual(planProgress(g), { done: 2, total: 4 });
  assert.equal(progressWord(g), '2/4');
  assert.deepEqual(planProgress(goal([], { progress: { done: 1, total: 3 } })), { done: 1, total: 3 });
  assert.equal(progressWord(goal([])), '');
  assert.deepEqual(planOf(null), []);
  assert.deepEqual(planProgress(null), { done: 0, total: 0 });
});

test('blocked, awaiting and active steps are found', () => {
  const g = goal([step(1, 'done'), step(2, 'blocked', { awaitsHuman: true, note: 'which DB?' }), step(3, 'blocked'), step(4, 'active')]);
  assert.equal(blockedSteps(g).length, 2);
  assert.ok(hasBlockedStep(g));
  assert.equal(awaitingStep(g).index, 2);
  assert.equal(activeStep(g).index, 4);
  assert.equal(awaitingStep(goal([step(1, 'blocked')])), null);
  assert.equal(activeStep(goal([])), null);
  assert.equal(hasBlockedStep(null), false);
});

test('state and kind words, next states', () => {
  assert.deepEqual(stateWords('done'), { glyph: '✓', word: 'done' });
  assert.deepEqual(stateWords('blocked'), { glyph: '✋', word: 'blocked' });
  assert.deepEqual(stateWords('nonsense'), { glyph: '○', word: 'pending' });
  assert.equal(kindWord('relay-loop'), 'relay loop');
  assert.equal(kindWord('human'), 'operator');
  assert.equal(kindWord(undefined), 'other');
  assert.deepEqual(nextStates(step(1, 'active')), ['pending', 'done', 'blocked', 'skipped']);
});

test('evidence lines: closing line monospace, hub path with size, a PR URL as a link, free text last', () => {
  const lines = evidenceLines(step(1, 'done', { evidence: { closingLine: 'TASK PR x https://…', hubPath: 'prg/out.csv', size: 12, jobId: 'j1', commit: 'abc', url: 'https://github.com/a/b/pull/7', text: 'went fine' } }));
  assert.deepEqual(lines.map((l) => l.label), ['closing line', 'hub', 'job', 'commit', 'PR', '']);
  assert.equal(lines[0].mono, true);
  assert.equal(lines[1].text, 'prg/out.csv (12 bytes)');
  assert.equal(lines[4].href, 'https://github.com/a/b/pull/7');
  assert.deepEqual(evidenceLines(step(1, 'pending')), []);
  assert.equal(evidenceLines(step(1, 'done', { evidence: { url: 'https://x/y' } }))[0].label, 'link');
});

test('the headline names progress, the active step, blocked count, derived and continued', () => {
  const g = goal([step(1, 'done'), step(2, 'active', { title: 'wait for prg' }), step(3, 'blocked')], { planDerived: true, continuesGoalId: 'g0' });
  assert.equal(planHeadline(g), '1/3 done · on step 2: wait for prg · 1 blocked · derived from the goal text · continues goal g0');
  assert.match(planHeadline(goal([])), /No step plan yet/);
  assert.equal(planHeadline(goal([], { state: 'done' })), 'No step plan.');
});

test('an ended goal can be continued; a running or done one cannot', () => {
  assert.ok(canContinue(goal([], { state: 'capped' })));
  assert.ok(canContinue(goal([], { state: 'error' })));
  assert.ok(canContinue(goal([], { state: 'stopped' })));
  assert.equal(canContinue(goal([], { state: 'running' })), false);
  assert.equal(canContinue(goal([], { state: 'done' })), false);
  assert.equal(canContinue(null), false);
});
