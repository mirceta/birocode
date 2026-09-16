// openspec one-policeman: the Policeman tab's words are pure functions of the status payload —
// state, timing, one line per journal entry, a row's actions, reading and flag, the explainer's data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loopState, timingLine, entrySummary, entryWhen, verdictLine, rowActions, readingOf, flagOf, triggerWord, columnWord, PASS, WRITES, NEVER, BEFORE } from './policemanLoop.js';

const now = 1_700_000_000_000;

test('the headline state: loading, no pass yet, running, reading off, or the cadence and count', () => {
  assert.deepEqual(loopState(null), ['loading', 'loading…']);
  assert.deepEqual(loopState({ lastAt: null, passes: 0 }), ['off', 'no pass yet']);
  assert.deepEqual(loopState({ running: true, lastAt: now, passes: 3 }), ['busy', 'pass running']);
  assert.deepEqual(loopState({ lastAt: now, passes: 1, intervalSeconds: 60, settings: { enabled: true } }), ['on', 'every 60 s · 1 pass since start']);
  assert.deepEqual(loopState({ lastAt: now, passes: 41, intervalSeconds: 60, settings: { enabled: false } }), ['wait', 'every 60 s · 41 passes since start · reading off']);
});

test('the timing line names the last trigger, the next due time and how many cards need you', () => {
  assert.equal(timingLine({ lastAt: null }, now), 'no pass yet');
  const st = { lastAt: now - 12_000, nextDueAt: now + 48_000, last: { trigger: 'timer' }, cards: [{ needsHuman: { at: now } }, {}, { needsHuman: { at: now } }] };
  assert.equal(timingLine(st, now), 'last pass 12 s ago (the minute timer) · next in 48 s · 2 cards need you');
  assert.match(timingLine({ lastAt: now - 5_000, nextDueAt: now - 1, last: { trigger: 'operator' }, cards: [] }, now), /you pressed Run now.*next any moment.*nothing needs you/);
  assert.equal(triggerWord('startup'), 'at startup');
  assert.equal(columnWord('pr-opened'), 'PR open');
});

test('one entry in a sentence: traces, moves, questions with their cost, flags, quiet runs, errors', () => {
  assert.equal(entrySummary({ changes: [], traced: [], questions: [], raised: [], cleared: [], repeats: 1 }), 'quiet — nothing to move, nobody to ask, nothing to flag');
  assert.equal(entrySummary({ changes: [], traced: [], questions: [], raised: [], cleared: [], repeats: 37 }), '37 quiet passes — nothing to move, nobody to ask, nothing to flag');
  assert.equal(entrySummary({ traced: [{}], changes: [{}, {}], questions: [{ tokens: 900 }, { tokens: 1100 }], raised: [{}], cleared: [] }), 'traced 1 PR · moved 2 cards · asked 🧠 2 (2,000 tokens) · raised 1 🆘');
  assert.equal(entrySummary({ changes: [], traced: [], questions: [], raised: [], cleared: [{}, {}] }), 'cleared 2 🆘');
  assert.equal(entrySummary({ error: 'gh: not logged in' }), 'failed: gh: not logged in');
  assert.equal(entryWhen({ at: now - 3600_000, lastAt: now - 60_000, repeats: 60 }, now), '1 h → 1 min ago');
  assert.equal(verdictLine({ honest: 4, dishonest: 1, stuck: 1, manual: 0 }), '4 honest · 1 not verified yet · 1 need human · 0 manual');
});

test('a sweep row: what the pass did to it, the model’s reading, the flag in words', () => {
  const row = {
    thisPass: { traced: [{ pr: 'PR #42 open', how: 'the assignee records branch feat/oauth' }], moved: [{ from: 'doing', to: 'pr-opened' }], asked: [{ state: 'waiting-review', tokens: 1167 }], raised: false, cleared: true },
    observation: { state: 'waiting-review', summary: 'PR #42 is up', at: now },
    needsHuman: null,
  };
  assert.deepEqual(rowActions(row), [['traced', 'PR #42 open — the assignee records branch feat/oauth'], ['moved', 'Doing → PR open'], ['asked 🧠', 'one question · 1,167 tokens'], ['cleared', '🆘']]);
  // Board behind reality (openspec policeman-board-behind): a merged PR discovered with nothing on the card.
  assert.deepEqual(rowActions({ thisPass: { traced: [{ pr: 'PR #113 merged', how: 'the harness recorded branch feature/kanban-agent-tabs for this task at dispatch', behind: true }] } }),
    [['traced', '⏪ board was behind reality — PR #113 merged — the harness recorded branch feature/kanban-agent-tabs for this task at dispatch']]);
  assert.deepEqual(rowActions({ thisPass: { asked: [{ error: 'timed out' }] } }), [['asked 🧠', 'no usable answer — timed out']]);
  assert.deepEqual(rowActions({}), []);
  assert.equal(readingOf(row)[1], 'Waiting for review');
  assert.equal(readingOf({})[1], 'not read yet');
  assert.equal(flagOf(row), null);
  const flagged = flagOf({ needsHuman: { by: 'policeman', reason: 'asked a question 3 h ago and nobody answered', at: now - 60_000 } }, now);
  assert.equal(flagged.text, 'needs you');
  assert.match(flagged.sub, /asked a question 3 h ago and nobody answered · raised 1 min ago by the policeman/);
  const answered = flagOf({ needsHuman: { by: 'policeman', reason: 'r', at: now - 120_000, answer: 'use the sandbox key', answeredAt: now - 30_000 } }, now);
  assert.equal(answered.text, 'answered — waiting for the agent');
  assert.match(answered.sub, /you: “use the sandbox key” · 30 s ago/);
});

test('the explainer data is complete: seven steps with exactly one for the model, four writes, five nevers, the before/after', () => {
  assert.equal(PASS.length, 7);
  assert.deepEqual(PASS.filter((s) => s[2] === 'model').map((s) => s[0]), ['ask']);
  assert.equal(WRITES.length, 4);
  assert.ok(WRITES.some(([w]) => /Agent section/.test(w)));
  assert.equal(NEVER.length, 5);
  assert.ok(NEVER.some((n) => /backwards/.test(n)) && NEVER.some((n) => /let the model/.test(n)));
  assert.equal(BEFORE.length, 3);
  assert.equal(BEFORE[2][0], 'now');
});
