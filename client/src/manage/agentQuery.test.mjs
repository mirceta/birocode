// node --test — the Status tab's as-you-type agent filter (fleet task 9be69c00,
// openspec status-filter-agent-name): case-insensitive substring on the agent's
// NAME in every form the user sees it (repo name, full handle, the chip's visible
// label), plus branch / remote URL / machine; several words AND together; an empty
// box filters nothing. The composition with the button filters is the caller's
// (FleetStatus applies both), pinned here by matching the same agent object shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentQueryHay, matchesAgentQuery, parseAgentQuery, patternMatches } from './agentQuery.js';

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

// ---- OR patterns (fleet task ca7d22b8, openspec status-filter-or) --------------------------------

const prg = { name: 'prg', handle: 'spacex/prg#1', branch: 'main', remoteUrl: 'https://github.com/mirceta/prg.git' };
const webflow = { name: 'web-flow-autodev1', handle: 'spacex/web-flow-autodev1#1', branch: 'feature/x', remoteUrl: 'https://github.com/mirceta/web-flow-autodev.git' };
const docs = { name: 'docs', handle: 'spacex/docs#1', branch: 'main', remoteUrl: '' };
const keep = (q) => [prg, webflow, docs].filter((x) => matchesAgentQuery(x, 'spacex', q)).map((x) => x.name);

test('several patterns OR together, separated by | or by ,; whitespace around separators is ignored', () => {
  assert.deepEqual(keep('prg | web-flow'), ['prg', 'web-flow-autodev1']);
  assert.deepEqual(keep('prg, web-flow'), ['prg', 'web-flow-autodev1']);
  assert.deepEqual(keep('  prg  |  web-flow  '), ['prg', 'web-flow-autodev1']);
  assert.deepEqual(keep('prg|docs|web-flow'), ['prg', 'web-flow-autodev1', 'docs']);
  // An empty alternative (trailing or doubled separator) is simply not there.
  assert.deepEqual(keep('prg |'), ['prg']);
  assert.deepEqual(keep('| prg ||'), ['prg']);
  assert.deepEqual(keep(' | , '), ['prg', 'web-flow-autodev1', 'docs']);   // only separators = no filter
});

test('a single pattern behaves exactly as before: case-insensitive substring, words AND together', () => {
  assert.deepEqual(keep('prg'), ['prg']);
  assert.deepEqual(keep('PRG'), ['prg']);
  assert.deepEqual(keep('flow-auto'), ['web-flow-autodev1']);
  assert.deepEqual(keep('spacex main'), ['prg', 'docs']);          // AND inside one alternative
  assert.deepEqual(keep('spacex main | web-flow'), ['prg', 'web-flow-autodev1', 'docs']);
  assert.deepEqual(keep('nothing-here'), []);
  assert.deepEqual(keep(''), ['prg', 'web-flow-autodev1', 'docs']);
  assert.deepEqual(keep('   '), ['prg', 'web-flow-autodev1', 'docs']);
});

test('* is a wildcard inside a pattern; *prg* means the same as prg', () => {
  assert.deepEqual(keep('*prg*'), ['prg']);
  assert.deepEqual(keep('web*dev'), ['web-flow-autodev1']);
  assert.deepEqual(keep('web*xyz'), []);
  assert.deepEqual(keep('*'), ['prg', 'web-flow-autodev1', 'docs']);
  assert.deepEqual(keep('*prg* | *docs*'), ['prg', 'docs']);
  assert.ok(patternMatches('spacex/web-flow-autodev1#1', 'web*1'));
  assert.ok(!patternMatches('spacex/prg#1', 'web*'));
  // Regex specials in a pattern are literal (a dot, a plus, a bracket).
  assert.ok(patternMatches('mirceta/prg.git', 'prg.git'));
  assert.ok(!patternMatches('mirceta/prgxgit', 'prg.git'));
});

test('a pattern typed without the hyphens still finds the hyphenated name: webflow matches web-flow', () => {
  assert.deepEqual(keep('prg | webflow'), ['prg', 'web-flow-autodev1']);
  assert.deepEqual(keep('webflowautodev'), ['web-flow-autodev1']);
  assert.ok(patternMatches('spacex/web-flow-autodev1#1', 'webflow'));
  assert.ok(!patternMatches('spacex/web-flow-autodev1#1', 'webflows'));
});

test('parseAgentQuery is the one parser: alternatives of words, empty ones dropped', () => {
  assert.deepEqual(parseAgentQuery('prg | web flow, docs'), [['prg'], ['web', 'flow'], ['docs']]);
  assert.deepEqual(parseAgentQuery(' | '), []);
  assert.deepEqual(parseAgentQuery(''), []);
  assert.deepEqual(parseAgentQuery(null), []);
  assert.deepEqual(parseAgentQuery('A'), [['a']]);
});
