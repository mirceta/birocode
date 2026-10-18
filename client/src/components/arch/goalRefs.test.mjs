// node --test — goal references (fleet task 64dcb229).
import test from 'node:test';
import assert from 'node:assert/strict';
import { shortTitle, goalMention, taskMention, splitGoalRefs, linkGoalRefsMarkdown, goalOfHref, insertAt, mentionInArch, takeMention, openGoal, conversationOfGoal, MENTION_EVENT, OPEN_TAB_EVENT, OPEN_GOAL_EVENT } from './goalRefs.js';

test('the mention names the goal by id with a short title from its first line', () => {
  assert.equal(goalMention({ id: '4ccefa45', goal: 'Build the Prompts tab in the Management dashboard and verify it live on the hub\nsecond line' }), 'goal 4ccefa45 (Build the Prompts tab in the Management dashboa…)');
  assert.equal(goalMention({ id: '4ccefa45', goal: 'Request from HUB/prg: fix the build' }), 'goal 4ccefa45 (fix the build)');
  assert.equal(goalMention({ id: '4ccefa45' }), 'goal 4ccefa45');
  assert.equal(goalMention(null), '');
  assert.equal(taskMention({ id: '5cc3e900aaaa', title: 'Prompts tab' }), 'task 5cc3e900 (Prompts tab)');
  assert.equal(taskMention({ id: '5cc3e900aaaa', title: '(deleted)' }), 'task 5cc3e900');
  assert.equal(shortTitle('a'.repeat(60), 10), 'aaaaaaaaa…');
});

test('goal refs are found in chat text as whole 8-hex ids, case-insensitive', () => {
  assert.deepEqual(splitGoalRefs('[goal 84495326 done — summary] continued Goal 772AAC13.'), [
    { text: '[' }, { goal: '84495326', raw: 'goal 84495326' }, { text: ' done — summary] continued ' }, { goal: '772aac13', raw: 'Goal 772AAC13' }, { text: '.' },
  ]);
  assert.deepEqual(splitGoalRefs('goal 1234567 and goal 123456789 and the goal of it'), [{ text: 'goal 1234567 and goal 123456789 and the goal of it' }]);
  assert.deepEqual(splitGoalRefs(''), []);
});

test('markdown refs become #goal-<id> links, never inside code spans or existing links', () => {
  assert.equal(linkGoalRefsMarkdown('goal 84495326 is done'), '[goal 84495326](#goal-84495326) is done');
  assert.equal(linkGoalRefsMarkdown('`goal 84495326` and [goal 84495326](http://x)'), '`goal 84495326` and [goal 84495326](http://x)');
  assert.equal(goalOfHref('#goal-84495326'), '84495326');
  assert.equal(goalOfHref('https://x/#goal-84495326'), null);
});

test('insertAt puts the mention at the caret with sensible spaces and returns the new caret', () => {
  assert.deepEqual(insertAt('', 'goal 4ccefa45 (x)'), { text: 'goal 4ccefa45 (x) ', caret: 18 });
  assert.deepEqual(insertAt('please stop', 'goal 4ccefa45', 6, 6), { text: 'please goal 4ccefa45 stop', caret: 20 });
  assert.deepEqual(insertAt('edit', 'goal 4ccefa45'), { text: 'edit goal 4ccefa45 ', caret: 19 });
  assert.deepEqual(insertAt('replace THIS now', 'goal 4ccefa45', 8, 12), { text: 'replace goal 4ccefa45 now', caret: 21 });
});

function fakeWin() {
  const store = new Map(); const events = [];
  return { events, sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, dispatchEvent(e) { events.push(e); return true; } };
}

test('a mention waits for the Arch composer, announces itself and asks for the Arch tab; open-goal names the goal', () => {
  const w = fakeWin();
  assert.equal(mentionInArch('goal 4ccefa45 (x)', w), true);
  assert.deepEqual(w.events.map((e) => e.type), [MENTION_EVENT, OPEN_TAB_EVENT]);
  assert.equal(takeMention(w), 'goal 4ccefa45 (x)');
  assert.equal(takeMention(w), null);
  assert.equal(mentionInArch('  ', w), false);
  openGoal('84495326', w);
  assert.equal(w.events.at(-1).type, OPEN_GOAL_EVENT);
  assert.equal(w.events.at(-1).detail.goalId, '84495326');
  assert.equal(conversationOfGoal([{ id: '@arch:a', goal: { id: '84495326' } }, { id: '@arch:b', goal: null }], '84495326').id, '@arch:a');
  assert.equal(conversationOfGoal([], 'x'), null);
});
