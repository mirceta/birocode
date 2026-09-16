// openspec kanban-card-sections: the pure rules behind a self-explaining card — the
// progress steps, the ONE plain-English Board check that always names its source, the
// rewritten (never raw) "not verified" reasons, and the labeled Links. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, SOURCES, progressOf, progressNote, boardCheckOf, plainUnverifiedReason, linksOf, isUnverified } from './cardSections.js';

const H = 3600_000;
const now = 1_800_000_000_000;

test('progress: the six steps in order, the current one lit, earlier ones done', () => {
  assert.deepEqual(STEPS.map(([k]) => k), ['todo', 'doing', 'committed', 'pr-opened', 'pr-merged', 'done']);
  const p = progressOf({ status: 'committed', verifiedStatus: 'committed' });
  assert.equal(p.currentLabel, 'Committed');
  assert.deepEqual(p.steps.map((s) => s.state), ['done', 'done', 'current', 'todo', 'todo', 'todo']);
  assert.equal(p.unverified, false);
  // A column ahead of the facts lights the current step as unverified.
  const q = progressOf({ status: 'pr-opened', verifiedStatus: 'doing' });
  assert.equal(q.steps[3].state, 'current-unverified');
  assert.equal(q.unverified, true);
  assert.equal(progressOf({ status: 'bogus' }).current, 'todo');
});

test('progress note: blocked, not assigned, pinged, awaiting ping, label only', () => {
  assert.equal(progressNote({ repoId: 'r', status: 'todo' }, { blockedBy: ['Build the API'] }), 'blocked — waits on Build the API');
  assert.equal(progressNote({ status: 'todo' }), 'not assigned');
  assert.equal(progressNote({ repoId: 'r', status: 'doing', dispatchedAt: now - 15 * 60_000, dispatchCount: 2 }, { now }), 'pinged 15 min ago (×2)');
  assert.equal(progressNote({ repoId: 'r', status: 'todo', assignedAt: 1 }), 'assigned — waiting for the arch to ping the assignee');
  assert.equal(progressNote({ repoId: 'r', status: 'todo' }), 'repo label only — re-assign to make it a real assignment');
});

test('board check: manual wins, then needs-human (naming who raised it), then not-verified, else honest', () => {
  const manual = boardCheckOf({ status: 'doing', manual: true, manualAt: now - H, needsHuman: { by: 'policeman', reason: 'x' }, warning: 'w' });
  assert.equal(manual.key, 'manual');
  assert.equal(manual.source, 'operator');
  assert.match(manual.text, /by hand/);

  const police = boardCheckOf({ status: 'doing', needsHuman: { by: 'policeman', reason: 'pinged, no PR and no progress for 30 h', at: now - 5 * 60_000 } });
  assert.equal(police.key, 'needs-human');
  assert.equal(police.sourceLabel, SOURCES.policeman);
  assert.equal(police.text, 'pinged, no PR and no progress for 30 h');
  assert.equal(police.resolvable, true);

  const agent = boardCheckOf({ status: 'doing', needsHuman: { by: 'agent', reason: 'need a credential' } });
  assert.equal(agent.sourceLabel, SOURCES.agent);
  const operator = boardCheckOf({ status: 'doing', needsHuman: { by: 'operator', reason: 'look at this' } });
  assert.equal(operator.sourceLabel, SOURCES.operator);

  const lying = boardCheckOf({ status: 'pr-opened', verifiedStatus: 'doing', warning: 'claimed pr-opened, verified: doing' }, { integrity: { state: 'dishonest', reason: 'column ahead of reality — …' } });
  assert.equal(lying.key, 'unverified');
  assert.equal(lying.word, 'Not verified yet');
  assert.equal(lying.source, 'auto-verifier');
  assert.doesNotMatch(lying.text, /column ahead of reality|claimed pr-opened/); // never the raw string
  assert.equal(lying.text, 'marked PR open, but no pull request has been found on GitHub yet');

  const honestSettled = boardCheckOf({ status: 'pr-merged', verifiedStatus: 'pr-merged', verifiedAt: now - H });
  assert.equal(honestSettled.key, 'honest');
  assert.equal(honestSettled.text, 'Merged is confirmed by the facts');
  assert.equal(honestSettled.at, now - H);
  const honestEarly = boardCheckOf({ status: 'doing' }, { checkedAt: now });
  assert.equal(honestEarly.key, 'honest');
  assert.match(honestEarly.text, /board matches reality/);
  assert.equal(honestEarly.at, now);
  assert.equal(boardCheckOf(null), null);
});

test('not-verified reasons are plain words per status', () => {
  assert.equal(plainUnverifiedReason({ status: 'committed', pushed: false }), 'marked Committed, but the branch is not pushed to origin yet');
  assert.equal(plainUnverifiedReason({ status: 'committed' }), 'marked Committed, but no commits on a branch have been seen yet');
  assert.equal(plainUnverifiedReason({ status: 'pr-merged', verifiedStatus: 'pr-opened' }), 'marked Merged, but GitHub does not show a merged pull request yet');
  assert.equal(plainUnverifiedReason({ status: 'done', verifiedStatus: 'pr-merged' }), 'marked Done, but the merge is not confirmed live yet');
  assert.equal(plainUnverifiedReason({ status: 'done', verifiedStatus: 'doing' }), 'marked Done, but the merge has not been confirmed yet');
  assert.equal(isUnverified('doing', null), false);
  assert.equal(isUnverified('committed', null), true);
  assert.equal(isUnverified('committed', 'committed'), false);
});

test('links: labeled facts with plain notes, and a short summary while collapsed', () => {
  const node = { branch: 'feat/csv', pushed: false, prUrl: 'https://github.com/o/r/pull/9', prNumber: 9, verifiedStatus: 'doing', verifiedAt: now - 2 * 60_000, dispatchedAt: now - H, dispatchCount: 1, createdBy: 'arch', ideaId: 'i1', status: 'committed', updatedAt: now - 30 * H };
  const l = linksOf(node, { now, stale: true, ideaNumber: 4 });
  const byKey = Object.fromEntries(l.items.map((i) => [i.key, i]));
  assert.equal(byKey.branch.note, 'not on origin — it lives only on the machine that did the work');
  assert.equal(byKey.branch.tone, 'warn');
  assert.equal(byKey.pr.value, 'PR #9');
  assert.equal(byKey.pr.href, node.prUrl);
  assert.equal(byKey.verified.value, 'Doing');
  assert.match(byKey.verified.note, /2 min ago, by the auto-verifier/);
  assert.equal(byKey.pinged.value, '1 h ago');
  assert.match(byKey.stale.value, /no activity for 30 h/);
  assert.equal(byKey.created.value, 'arch');
  assert.equal(byKey.idea.value, '#4');
  assert.equal(l.summary, '⎇ feat/csv (not on origin) · PR #9 · stale');
  // Blocked beats prerequisites; an empty card still has a summary.
  assert.equal(linksOf({}, { blockedBy: ['A'] }).items[0].key, 'blocked');
  assert.equal(linksOf({}, { prereqs: [{}, {}] }).items[0].value, '2 done');
  assert.equal(linksOf({}).summary, '0 details');
});
