// openspec policeman-observes-agents: the Agent section — what the policeman read, with provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OBSERVATIONS, observationOf } from './cardSections.js';

test('the Agent section carries the reading, the words, and the provenance', () => {
  assert.equal(Object.keys(OBSERVATIONS).length, 8);
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

test('a handoff ending reads "Handoff pending" with the target, needs attention until a follow-up card exists, then reads "tracked" (openspec policeman-handoff-detection)', () => {
  const pending = observationOf({ observation: { at: 5, by: 'policeman', state: 'handoff', summary: 'prg must skip voided rows in the invoice import', target: 'prg' } });
  assert.equal(pending.key, 'handoff');
  assert.equal(pending.word, 'Handoff pending');
  assert.equal(pending.text, 'prg must skip voided rows in the invoice import — for prg · no follow-up task on the board yet — the arch or you should create it');
  assert.equal(pending.attention, true);
  assert.equal(pending.target, 'prg');
  assert.equal(pending.followUp, null);
  const tracked = observationOf({ observation: { at: 5, by: 'policeman', state: 'handoff', summary: 'prg must skip voided rows', target: 'prg', followUpId: 'cbc74bc0934f4442b9bd2949203818af' } });
  assert.equal(tracked.word, 'Handoff tracked');
  assert.equal(tracked.attention, false);
  assert.equal(tracked.followUp, 'cbc74bc0');
  assert.match(tracked.text, /follow-up card #cbc74bc0 exists/);
  const unnamed = observationOf({ observation: { at: 5, by: 'policeman', state: 'handoff', summary: 'someone must fix the export' } });
  assert.equal(unnamed.text, 'someone must fix the export · no follow-up task on the board yet — the arch or you should create it');
  assert.equal(OBSERVATIONS.handoff[1], 'Handoff pending');
});
