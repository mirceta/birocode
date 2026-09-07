// fleet-status task dfee16ea: the activity dot on the Kanban card badges must show the
// SAME state as Fleet Status for the same agent. Both derive it from agentDotState over
// the same fleet-status fields, so this pins that shared rule: running > free (on default)
// > claimed (feature branch) > idle, and an agent the fleet doesn't know reads "unknown".
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentDotState } from './agentActivity.js';

test('running wins over every branch state (pulsing dot)', () => {
  assert.equal(agentDotState({ runningSince: Date.now(), onDefault: true, branch: 'main' }), 'running');
  assert.equal(agentDotState({ runningSince: 1, onDefault: false, branch: 'feature/x' }), 'running');
});

test('on its default branch and idle → free (solid green)', () => {
  assert.equal(agentDotState({ runningSince: null, onDefault: true, branch: 'main' }), 'free');
});

test('on a feature branch and idle → claimed (amber)', () => {
  assert.equal(agentDotState({ runningSince: 0, onDefault: false, branch: 'feature/x' }), 'claimed');
});

test('unknown branch, not running, not on default → idle (grey)', () => {
  assert.equal(agentDotState({ runningSince: null, onDefault: false, branch: 'unknown' }), 'idle');
  assert.equal(agentDotState({ runningSince: null, onDefault: false, branch: '' }), 'idle');
});

test('agent not in the fleet snapshot → unknown', () => {
  assert.equal(agentDotState(null), 'unknown');
  assert.equal(agentDotState(undefined), 'unknown');
});
