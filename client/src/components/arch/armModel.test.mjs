import test from 'node:test';
import assert from 'node:assert/strict';
import { armView, holderLine, agoWords, ARM_RULES } from './armModel.js';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

test('OFF: says it cannot send, why, how long ago, and offers Turn on', () => {
  const v = armView({ armed: false, holders: [], last: { kind: 'arch', why: 'the standing wake loop stopped because its conversation was deleted', at: NOW - 3 * 86400e3 }, armBlocked: null }, NOW);
  assert.equal(v.tone, 'off');
  assert.match(v.title, /OFF — it cannot send tasks/);
  assert.deepEqual(v.lines, ['Why: the standing wake loop stopped because its conversation was deleted (3 days ago)']);
  assert.equal(v.action.label, '▶ Turn the arch on');
  assert.equal(v.action.armed, true);
  assert.equal(v.action.disabled, false);
});

test('OFF after a goal: the last loop AND what happened to the standing loop', () => {
  const v = armView({ armed: false, holders: [],
    last: { conversation: '@arch:g1', why: 'the goal loop finished — its goal was verified', at: NOW - 15 * 3600e3 },
    lastStanding: { conversation: '@arch:s1', why: 'the standing wake loop stopped because its conversation was deleted', at: NOW - 3 * 86400e3 },
    armBlocked: null }, NOW);
  assert.deepEqual(v.lines, [
    'Why: the goal loop finished — its goal was verified (15 h ago)',
    'Standing wake loop: stopped because its conversation was deleted (3 days ago)',
  ]);
  const noStanding = armView({ armed: false, holders: [], last: { conversation: 'g', kind: 'goal', why: 'the goal loop finished — its goal was verified', at: NOW }, lastStanding: null }, NOW);
  assert.match(noStanding.lines[1], /never turned on — goals kept the arch on only while they ran/);
});

test('OFF and blocked: the button is disabled and the reason is shown', () => {
  const v = armView({ armed: false, holders: [], last: null, armBlocked: 'the autopilot gate is closed on the host computer' }, NOW);
  assert.deepEqual(v.lines, ['It has never been turned on.', 'Cannot turn on yet: the autopilot gate is closed on the host computer']);
  assert.equal(v.action.disabled, true);
});

test('ON: names what keeps it on; turning off asks first when it would stop a goal', () => {
  const standing = { kind: 'arch', name: 'Standing loop', mode: 'drive', cap: 0, iterations: 3 };
  const goal = { kind: 'goal', name: 'prg CI', goal: 'every open prg task lands as a PR', cap: 40, iterations: 7 };
  const one = armView({ armed: true, holders: [standing] }, NOW);
  assert.match(one.title, /ON — it can send tasks/);
  assert.deepEqual(one.lines, ['Kept on by the standing wake loop on “Standing loop” (drive, no cap, 3 wakes)']);
  assert.equal(one.action.confirm, null);
  const two = armView({ armed: true, holders: [standing, goal] }, NOW);
  assert.match(two.action.confirm, /stops 2 running loops/);
  assert.equal(holderLine(goal), 'goal “every open prg task lands as a PR” on “prg CI” (7/40) — only while it runs');
});

test('agoWords and the rules table', () => {
  assert.equal(agoWords(NOW - 30e3, NOW), 'just now');
  assert.equal(agoWords(NOW - 5 * 60e3, NOW), '5 min ago');
  assert.equal(agoWords(NOW - 3 * 3600e3, NOW), '3 h ago');
  assert.ok(ARM_RULES.some(([, off]) => /Deleting the conversation/.test(off)));
});
