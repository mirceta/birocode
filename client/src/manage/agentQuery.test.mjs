// node --test — the Status tab's as-you-type agent filter (fleet task 9be69c00,
// openspec status-filter-agent-name): case-insensitive substring on the agent's
// NAME in every form the user sees it (repo name, full handle, the chip's visible
// label), plus branch / remote URL / machine; several words AND together; an empty
// box filters nothing. The composition with the button filters is the caller's
// (FleetStatus applies both), pinned here by matching the same agent object shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentQueryHay, matchesAgentQuery } from './agentQuery.js';

const a = {
  name: 'web-flow-autodev',
  handle: 'MONSTER/web-flow-autodev#1',
  branch: 'feature/exporter',
  remoteUrl: 'https://github.com/mirceta/web-flow-autodev.git',
};

test('the repo name matches, case-insensitively, as a substring, as you type', () => {
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'web'));
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'AUTODEV'));
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'flow-auto'));
  assert.ok(!matchesAgentQuery(a, 'MONSTER', 'exporterx'));
});

test('the VISIBLE name matches too: the chip label and the full handle', () => {
  // What the chip prints is "web-flow-autodev#1" — typing it must keep the chip.
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'autodev#1'));
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'monster/web-flow'));
  // The old haystack (name/branch/url/machine only) lost this one:
  assert.ok(!`${a.name} ${a.branch} ${a.remoteUrl} MONSTER`.toLowerCase().includes('autodev#1'));
});

test('branch, remote URL and machine stay searchable; words AND together', () => {
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'feature/exporter'));
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'github.com/mirceta'));
  assert.ok(matchesAgentQuery(a, 'MONSTER', 'monster autodev'));
  assert.ok(!matchesAgentQuery(a, 'MONSTER', 'monster laptop'));
});

test('an empty or blank box filters nothing; missing fields never throw', () => {
  assert.ok(matchesAgentQuery(a, 'MONSTER', ''));
  assert.ok(matchesAgentQuery(a, 'MONSTER', '   '));
  assert.ok(matchesAgentQuery({}, null, ''));
  assert.ok(!matchesAgentQuery({}, null, 'anything'));
  assert.ok(matchesAgentQuery({ name: 'x' }, undefined, 'x'));
});

test('the haystack is one lowercased string with every findable form in it', () => {
  const hay = agentQueryHay(a, 'MONSTER');
  for (const part of ['web-flow-autodev', 'monster/web-flow-autodev#1', 'web-flow-autodev#1', 'feature/exporter', 'github.com', 'monster']) {
    assert.ok(hay.includes(part), part);
  }
});
