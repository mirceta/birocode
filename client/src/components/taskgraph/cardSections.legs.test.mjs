// openspec cross-repo-effort-legs: the Legs section of a cross-repo effort — typed legs (driver /
// driven), agentless checkouts named by path, per-leg merge words, "N of M legs merged",
// PARTIALLY merged named, and the Board check's mismatch text when the column claims merged
// while a leg is not (the Knjiga-pošte rule). Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legsOf, boardCheckOf, isAgentlessLeg, legPath, pathTail, legMergeWord, ROLES } from './cardSections.js';
import { flagsOf, FLAGS } from './taskFilters.js';

const PR21 = 'https://github.com/mirceta/web-flow-autodev/pull/21';
const PR166 = 'https://github.com/mirceta/prg/pull/166';
const COPY = 'C:\\prgcopies\\copy1\\prg';
const driver = { sourceId: 'src-spacex', repoId: 'r-webflow', role: 'driver', status: 'pr-merged', verifiedStatus: 'pr-merged', branch: 'knjiga-poste-prenos-orchestration', prUrl: PR21, prNumber: 21, mergeCommit: '4fbaff0c' };
const driven = { sourceId: null, repoId: `path:${COPY}`, path: COPY, role: 'driven', status: 'pr-opened', verifiedStatus: 'pr-opened', branch: 'knjiga-poste', prUrl: PR166, prNumber: 166 };
const label = (a) => (a.repoId === 'r-webflow' ? 'spacex/web-flow-autodev#1' : a.repoId);

test('agentless legs are named by their checkout, never by an agent', () => {
  assert.equal(isAgentlessLeg(driven), true);
  assert.equal(isAgentlessLeg({ repoId: 'path:/srv/x' }), true);
  assert.equal(isAgentlessLeg(driver), false);
  assert.equal(legPath(driven), COPY);
  assert.equal(legPath({ repoId: 'path:/srv/x' }), '/srv/x');
  assert.equal(legPath(driver), null);
  assert.equal(pathTail(COPY), 'copy1/prg');
  assert.equal(pathTail('/srv/x'), 'srv/x');
  assert.equal(pathTail('prg'), 'prg');
  assert.deepEqual(Object.keys(ROLES), ['driver', 'driven']);
});

test('merge words match the server', () => {
  assert.equal(legMergeWord(driver), 'merged (PR #21)');
  assert.equal(legMergeWord(driven), 'PR #166 open, not merged');
  assert.equal(legMergeWord({ prNumber: 7 }), 'PR #7 not verified');
  assert.equal(legMergeWord({ prUrl: PR166 }), 'PR recorded, not verified');
  assert.equal(legMergeWord({ branch: 'b' }), 'no PR');
  assert.equal(legMergeWord({}), 'no PR recorded');
});

test('the Knjiga-pošte card: one leg merged, one not → partially merged, shown, and NOT done', () => {
  // The node mirrors its primary (driver) leg's verified state, as the server does.
  const card = { id: 'cbc74bc0934f4442b9bd2949203818af', status: 'pr-opened', verifiedStatus: 'pr-merged', assignees: [driver, driven] };
  const legs = legsOf(card, { label });
  assert.equal(legs.show, true);
  assert.equal(legs.crossRepo, true);
  assert.equal(legs.total, 2);
  assert.equal(legs.merged, 1);
  assert.equal(legs.partiallyMerged, true);
  assert.equal(legs.allMerged, false);
  assert.equal(legs.summary, '1 of 2 legs merged — partially merged, not done');
  assert.equal(legs.mismatch, null); // the column (PR open) is honest about it
  assert.deepEqual(legs.legs.map((l) => [l.label, l.roleWord, l.agentless, l.merged, l.mergeWord]), [
    ['spacex/web-flow-autodev#1', 'driver', false, true, 'merged (PR #21)'],
    ['copy1/prg', 'driven', true, false, 'PR #166 open, not merged'],
  ]);
  assert.equal(legs.legs[1].path, COPY);
  assert.match(legs.title, /done only when EVERY leg/);
  // The Board check stays whatever the facts say for a PR-open column.
  assert.equal(boardCheckOf(card, { label }).key, 'honest');
});

test('the column claiming done off one merged leg is Not verified yet, with every leg named', () => {
  const card = { id: 'cbc74bc0934f4442b9bd2949203818af', status: 'done', assignees: [{ ...driver, status: 'done' }, { ...driven, status: 'done' }] };
  const legs = legsOf(card, { label });
  assert.equal(legs.mismatch, 'cross-repo effort: 1 of 2 legs merged on GitHub (spacex/web-flow-autodev#1 merged (PR #21)); not merged: copy1/prg — PR #166 open, not merged — the card is not done until every leg is merged');
  const check = boardCheckOf(card, { label });
  assert.equal(check.key, 'unverified');
  assert.equal(check.text, legs.mismatch);
  assert.equal(check.source, 'auto-verifier');
  // Both merged → no mismatch, every leg merged.
  const both = legsOf({ status: 'pr-merged', assignees: [driver, { ...driven, verifiedStatus: 'pr-merged', status: 'pr-merged' }] }, { label });
  assert.equal(both.mismatch, null);
  assert.equal(both.allMerged, true);
  assert.equal(both.summary, '2 of 2 legs merged — every leg merged');
});

test('a plain single-agent card has no Legs section; a single typed or agentless leg shows one', () => {
  assert.equal(legsOf({ repoId: 'r1', status: 'doing' }).show, false);
  assert.equal(legsOf({ assignees: [{ repoId: 'r1', status: 'doing' }] }).show, false);
  assert.equal(legsOf({ assignees: [{ repoId: 'r1', status: 'doing', role: 'driver' }] }).show, true);
  assert.equal(legsOf({ assignees: [driven] }).show, true);
  assert.equal(legsOf(null).total, 0);
  assert.equal(legsOf({}).summary, 'no legs');
});

test('flagsOf: partially merged is a filter flag of its own', () => {
  const partial = new Set(['p']);
  assert.deepEqual(flagsOf('p', null, null, null, null, null, partial), ['partial-merge']);
  assert.deepEqual(flagsOf('q', null, null, null, null, null, partial), []);
  const row = FLAGS.find(([k]) => k === 'partial-merge');
  assert.ok(row && /partially merged/.test(row[1]) && /NOT done/.test(row[2]));
});
