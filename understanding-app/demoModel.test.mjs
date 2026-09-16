// openspec one-policeman (proposal): the demo's simulation is a pure, scripted loop — every pass
// moves by the facts, asks the model once per card with new words, flags by rule, journals; an
// answered flag clears once the agent continues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, runPass, answerFlag, timelineOf, answerFor, STATES } from './demoModel.js';

const T0 = 1_700_000_000_000;

test('the first pass moves the OAuth card by its PR, asks four questions, flags two cards — one by the reading, one by the rule', () => {
  const s = runPass(initialState(T0), 'startup');
  const e = s.journal[0];
  assert.equal(s.passes, 1);
  assert.deepEqual(e.moves.map((m) => [m.id.slice(0, 4), m.from, m.to]), [['b2c3', 'doing', 'pr-opened']]);
  assert.equal(e.questions.length, 4, 'one question per card with unread words; the silent and the done card are not asked');
  assert.ok(e.questions.every((q) => STATES[q.state]), 'every answer is in the vocabulary');
  const csv = s.cards.find((c) => c.id.startsWith('a1b2'));
  const rate = s.cards.find((c) => c.id.startsWith('e5f6'));
  assert.equal(csv.observation.state, 'asked-question');
  assert.match(csv.flag.reason, /asked a question .* nobody answered/);
  assert.match(rate.flag.reason, /no PR and no progress/);
  assert.equal(e.raised.length, 2);
  assert.ok(e.tokens > 0 && e.durationMs > 0);
});

test('a column ahead of the facts is flagged only after two sweeps; a merged PR moves the card again; quiet passes are quiet', () => {
  let s = runPass(initialState(T0), 'startup');
  const rename = () => s.cards.find((c) => c.id.startsWith('c3d4'));
  assert.equal(rename().flag, null, 'first sweep: noted, not flagged');
  s = runPass(s, 'timer');
  assert.match(rename().flag.reason, /for 2 sweeps/);
  s = runPass(s, 'timer');
  assert.ok(s.journal[0].moves.some((m) => m.to === 'pr-merged'), 'GitHub merged the OAuth PR');
  s = runPass(s, 'timer');
  assert.equal(rename().verified, 'pr-opened', 'the facts catch up with the rename card: PR #43 is open');
  assert.equal(s.journal[0].moves.length, 0, 'no move — the card already sat in PR open; only the facts changed');
  assert.equal(rename().flag, null, 'the flag clears once the facts match');
  s = runPass(s, 'timer');
  assert.equal(s.journal[0].quiet, true);
  assert.equal(s.passes, 5);
});

test('answering a flag on the card reaches the agent; the flag clears when it continues; the timeline shows the whole story', () => {
  let s = runPass(initialState(T0), 'startup');
  const id = s.cards.find((c) => c.id.startsWith('a1b2')).id;
  s = answerFlag(s, id, 'Use the sandbox key.');
  assert.equal(s.cards.find((c) => c.id === id).flag.answered, true);
  s = runPass(s, 'answer');
  const csv = s.cards.find((c) => c.id === id);
  assert.equal(csv.flag, null);
  assert.equal(csv.observation.state, 'working');
  assert.match(csv.messages[csv.messages.length - 1].text, /Use the sandbox key/);
  const tl = timelineOf(s, id);
  assert.equal(tl.length, 2);
  assert.ok(tl[0].cleared.some((f) => f.id === id) && tl[1].raised.some((f) => f.id === id));
});

test('the scripted model answer reads the last message', () => {
  assert.equal(answerFor({ messages: [{ text: 'Which key should I use?' }] }).state, 'asked-question');
  assert.equal(answerFor({ messages: [{ text: 'Opened PR #7, waiting for review' }] }).state, 'waiting-review');
  assert.equal(answerFor({ messages: [{ text: 'I cannot proceed without access' }] }).state, 'blocked');
  assert.equal(answerFor({ messages: [{ text: 'Running the script now' }] }).state, 'working');
});
