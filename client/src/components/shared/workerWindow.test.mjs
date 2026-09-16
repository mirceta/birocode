// node --test — per-agent tab names (follow-up to board task afed9d6d): each
// assignee key maps to one stable, distinct, safe window name; the engine-side
// behaviour (find-don't-reload + focus across OS windows) is pinned in
// .claudeweb-preview/playwright/check-agent-tabs.mjs (6/6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentTabName } from './workerWindow.js';

test('one stable name per assignee key, unsafe chars sanitized', () => {
  assert.equal(agentTabName('src-1|repo-9'), 'birocode-agent-src-1_repo-9');
  assert.equal(agentTabName('src-1|repo-9'), agentTabName('src-1|repo-9')); // stable
  assert.equal(agentTabName('|self-repo'), 'birocode-agent-_self-repo');
  assert.equal(agentTabName('a b/c#2|r'), 'birocode-agent-a_b_c_2_r');
});

test('distinct agents get distinct tabs', () => {
  assert.notEqual(agentTabName('s1|r1'), agentTabName('s1|r2'));
  assert.notEqual(agentTabName('s1|r1'), agentTabName('s2|r1'));
});

test('an empty key yields no name (no button, never a broken open)', () => {
  assert.equal(agentTabName(''), null);
  assert.equal(agentTabName('   '), null);
  assert.equal(agentTabName(null), null);
  assert.equal(agentTabName(undefined), null);
});
