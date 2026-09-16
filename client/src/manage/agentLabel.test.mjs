// node --test — Fleet Status chip label: repo agent only, no machine prefix (task 1dc2812c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { repoAgentLabel } from './agentLabel.js';

test('strips the machine prefix off a <machine>/<handle> label', () => {
  assert.equal(repoAgentLabel('spacex/prg#2', 'prg', 'spacex'), 'prg#2');
  assert.equal(repoAgentLabel('DESKTOP-POAPPP3/birocode', 'birocode', 'DESKTOP-POAPPP3'), 'birocode');
  assert.equal(repoAgentLabel('fotrsqlbirokrat/claude-web-this-app', 'Claude Web (this app)', 'fotrsqlbirokrat'), 'claude-web-this-app');
});

test('a long machine name never survives into the label', () => {
  const machine = 'a-very-long-machine-name-that-used-to-eat-the-whole-chip';
  assert.equal(repoAgentLabel(`${machine}/prg`, 'prg', machine), 'prg');
});

test('machine prefix match is case-insensitive, like handle resolution', () => {
  assert.equal(repoAgentLabel('SpaceX/prg', 'prg', 'spacex'), 'prg');
});

test('a machine label containing a slash is stripped whole, not cut at the first slash', () => {
  assert.equal(repoAgentLabel('living/room/prg#3', 'prg', 'living/room'), 'prg#3');
});

test('without a machine hint the part after the last slash is the handle', () => {
  assert.equal(repoAgentLabel('spacex/prg#2', 'prg'), 'prg#2');
  assert.equal(repoAgentLabel('living/room/prg', 'prg'), 'prg');
});

test('a handle with no machine part is shown as is', () => {
  assert.equal(repoAgentLabel('prg#2', 'prg', 'spacex'), 'prg#2');
  assert.equal(repoAgentLabel('prg', 'prg'), 'prg');
});

test('falls back to the repo name when there is no handle', () => {
  assert.equal(repoAgentLabel(null, 'prg', 'spacex'), 'prg');
  assert.equal(repoAgentLabel('', 'prg', 'spacex'), 'prg');
  assert.equal(repoAgentLabel(undefined, undefined, 'spacex'), '');
});

test('degenerate labels never yield an empty string when a handle was given', () => {
  assert.equal(repoAgentLabel('spacex/', 'prg', 'spacex'), 'spacex/');
  assert.equal(repoAgentLabel('/prg', 'prg', 'spacex'), '/prg');
});
