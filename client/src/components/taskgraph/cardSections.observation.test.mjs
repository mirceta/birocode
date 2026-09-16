// openspec policeman-observes-agents: the Agent section — what the policeman read, with provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OBSERVATIONS, observationOf } from './cardSections.js';

test('the Agent section carries the reading, the words, and the provenance', () => {
  assert.equal(Object.keys(OBSERVATIONS).length, 7);
  assert.equal(observationOf({}), null);
  const o = observationOf({ observation: { at: 5, by: 'policeman', state: 'asked-question', summary: 'asked for the API key 30 min ago, no answer', sessionId: 'a1f3c9d2ffff' } });
  assert.equal(o.key, 'asked-question');
  assert.equal(o.word, 'Asked a question');
  assert.equal(o.text, 'asked for the API key 30 min ago, no answer');
  assert.equal(o.sourceLabel, 'seen by the policeman');
  assert.equal(o.session, 'a1f3c9d2');
  assert.equal(o.attention, true);
  assert.equal(observationOf({ observation: { state: 'working', by: 'policeman' } }).attention, false);
  // An unknown state still renders, honestly, as "Observed".
  const u = observationOf({ observation: { state: 'weird', by: 'agent', summary: 'x' } });
  assert.equal(u.key, 'other');
  assert.equal(u.word, 'weird');
  assert.equal(u.sourceLabel, 'seen by agent');
});
