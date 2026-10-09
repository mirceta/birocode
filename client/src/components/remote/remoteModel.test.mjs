import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeOf, showingLine, lastReply, openQuestion, chatBody, targetLabel, cleanPin, sofaOn, appsOf } from './remoteModel.js';

test('sofa view shows in the showing line and drives the button; apps come from the repo list', () => {
  assert.equal(showingLine([{ name: 'projector', activeAgent: 'pers-dec', layout: 'sofa' }]), 'projector · pers-dec · sofa view');
  assert.equal(showingLine([{ name: 'projector', activeAgent: 'pers-dec', layout: 'normal' }]), 'projector · pers-dec');
  assert.equal(sofaOn([{ layout: 'sofa' }]), true);
  assert.equal(sofaOn([{ layout: 'normal' }]), false);
  assert.equal(sofaOn([]), false);
  const repos = [{ id: 'r1', localApps: [{ id: 'app--28166', name: 'homepage', port: 28166 }, { id: 'app--5', port: 5 }] }];
  assert.deepEqual(appsOf(repos, 'r1'), [{ id: 'app--28166', name: 'homepage' }, { id: 'app--5', name: 'App :5' }]);
  assert.deepEqual(appsOf(repos, 'nope'), []);
});

test('badgeOf: one badge by urgency', () => {
  assert.equal(badgeOf({ status: 'running', waiting: true, unseenResult: true }), 'busy');
  assert.equal(badgeOf({ status: 'idle', waiting: true, unseenResult: true }), 'waiting');
  assert.equal(badgeOf({ status: 'done', unseenResult: true }), 'unseen');
  assert.equal(badgeOf({ status: 'idle' }), '');
  assert.equal(badgeOf(null), '');
});

test('showingLine: the first live screen, agent before view before name; null when nothing listens', () => {
  assert.equal(showingLine([]), null);
  assert.equal(showingLine(null), null);
  assert.equal(showingLine([{ name: 'projector', activeAgent: 'pers-dec', view: 'agent' }]), 'projector · pers-dec');
  assert.equal(showingLine([{ name: 'projector', activeAgent: null, view: 'management · kanban' }]), 'projector · management · kanban');
  assert.equal(showingLine([{ name: 'projector' }]), 'projector');
});

test('lastReply: the latest non-empty assistant message', () => {
  assert.equal(lastReply([]), null);
  const m = lastReply([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Done.' }, { role: 'assistant', text: '  ' }, { role: 'user', text: 'ok' }]);
  assert.equal(m.text, 'Done.');
});

test('openQuestion: the last tool call is an unanswered AskUserQuestion and the assistant spoke last', () => {
  const input = { questions: [{ question: 'Which statement?', header: 'October', options: [{ label: 'NLB', description: '1.–31.10.' }, { label: 'Revolut' }] }] };
  const tools = [{ name: 'Read', result: 'x' }, { name: 'AskUserQuestion', input, result: '' }];
  const msgs = [{ role: 'user', text: 'import' }, { role: 'assistant', text: 'Two match.' }];
  const q = openQuestion(tools, msgs);
  assert.equal(q.question, 'Which statement?');
  assert.deepEqual(q.options.map((o) => o.label), ['NLB', 'Revolut']);
  assert.equal(q.options[0].description, '1.–31.10.');
  // answered (a result arrived) → no open question
  assert.equal(openQuestion([{ name: 'AskUserQuestion', input, result: 'NLB' }], msgs), null);
  // the user already replied → no open question
  assert.equal(openQuestion(tools, [...msgs, { role: 'user', text: 'NLB' }]), null);
  // the question is not the last tool call → no open question
  assert.equal(openQuestion([...tools, { name: 'Bash', result: '' }], msgs), null);
  // input as a JSON string (the transcript's raw form) works too
  assert.equal(openQuestion([{ name: 'AskUserQuestion', input: JSON.stringify(input), result: '' }], msgs).options.length, 2);
  assert.equal(openQuestion([{ name: 'AskUserQuestion', input: '{bad', result: '' }], msgs), null);
  assert.equal(openQuestion([], msgs), null);
});

test('chatBody: lane only when not builder, session when known', () => {
  assert.deepEqual(chatBody('hi', { lane: 'builder' }), { message: 'hi' });
  assert.deepEqual(chatBody('hi', { lane: 'ask', sessionId: 's1' }), { message: 'hi', lane: 'ask', sessionId: 's1' });
});

test('targetLabel and cleanPin', () => {
  assert.equal(targetLabel(null), '');
  assert.equal(targetLabel({ kind: 'arch' }, (k) => (k === 'remote.theArch' ? 'the arch' : k)), 'the arch');
  assert.equal(targetLabel({ kind: 'agent', name: 'pers-dec' }), 'pers-dec');
  assert.equal(targetLabel({ kind: 'agent', repoId: 'abc' }), 'abc');
  assert.equal(cleanPin('12 34-56 78'), '123456');
  assert.equal(cleanPin(null), '');
});
