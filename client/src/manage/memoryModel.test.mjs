// node --test — the Memory tab's model (openspec arch-memory-store, fleet task 0953472c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEntries, groupByKind, badgesOf, summary, secretFinding, editorProblems, authorFamily, tagCounts, parseTags, ago } from './memoryModel.js';

const E = (o) => ({ id: o.id, title: o.title || o.id, body: o.body || '', kind: o.kind || 'other', tags: o.tags || [], author: o.author || 'arch', status: o.status || 'active', pinned: !!o.pinned, stale: !!o.stale, needsReview: !!o.needsReview, usedRecently: !!o.usedRecently, updated: o.updated || 0 });
const entries = [
  E({ id: 'p1', kind: 'principle', author: 'operator', pinned: true, updated: 5 }),
  E({ id: 'r1', kind: 'rule', body: 'one task per repo', tags: ['repo:prg'], stale: true }),
  E({ id: 'n1', kind: 'repo-note', tags: ['repo:prg', 'machine:HUB'], needsReview: true, usedRecently: true, updated: 9 }),
  E({ id: 'n2', kind: 'repo-note', tags: ['repo:phone-agent'], updated: 3, author: 'goal 1234abcd' }),
  E({ id: 'x1', kind: 'fleet-fact', status: 'retired' }),
];

test('filters by kind, tag, author family, status, flags and every query word', () => {
  assert.deepEqual(filterEntries(entries).map((e) => e.id), ['p1', 'r1', 'n1', 'n2']);            // active by default
  assert.deepEqual(filterEntries(entries, { status: 'retired' }).map((e) => e.id), ['x1']);
  assert.deepEqual(filterEntries(entries, { status: 'all' }).length, 5);
  assert.deepEqual(filterEntries(entries, { kind: 'repo-note' }).map((e) => e.id), ['n1', 'n2']);
  assert.deepEqual(filterEntries(entries, { tag: 'repo:prg' }).map((e) => e.id), ['r1', 'n1']);
  assert.deepEqual(filterEntries(entries, { author: 'goal' }).map((e) => e.id), ['n2']);
  assert.deepEqual(filterEntries(entries, { only: 'stale' }).map((e) => e.id), ['r1']);
  assert.deepEqual(filterEntries(entries, { only: 'review' }).map((e) => e.id), ['n1']);
  assert.deepEqual(filterEntries(entries, { only: 'used' }).map((e) => e.id), ['n1']);
  assert.deepEqual(filterEntries(entries, { query: 'task PRG' }).map((e) => e.id), ['r1']);
});

test('groups in kind order, pinned then newest first, empty groups dropped', () => {
  const g = groupByKind(filterEntries(entries));
  assert.deepEqual(g.map((x) => x.kind), ['principle', 'rule', 'repo-note']);
  assert.deepEqual(g[2].entries.map((e) => e.id), ['n1', 'n2']);
});

test('badges: pinned, always loaded, used, STALE, review, retired', () => {
  assert.deepEqual(badgesOf(entries[0]).map((b) => b.key), ['pinned', 'always']);
  assert.deepEqual(badgesOf(entries[1]).map((b) => b.key), ['stale']);
  assert.deepEqual(badgesOf(entries[2]).map((b) => b.key), ['used', 'review']);
  assert.deepEqual(badgesOf(entries[4]).map((b) => b.key), ['retired']);
});

test('summary counts the header strip', () => {
  assert.deepEqual(summary(entries), { total: 5, active: 4, always: 1, stale: 1, review: 1, used: 1, retired: 1 });
});

test('the editor needs a title, a kind and a reason, and refuses secrets before the round trip', () => {
  assert.deepEqual(editorProblems({ title: '', kind: 'nope', reason: '' }), ['a title', 'a kind', 'a one-line reason']);
  assert.deepEqual(editorProblems({ title: 't', kind: 'rule', reason: 'r', body: 'Server=db;Password=hunter22;' }), ['no secrets (this looks like a connection string with a password)']);
  assert.deepEqual(editorProblems({ title: 't', kind: 'rule', reason: 'r', body: 'the PAT lives in the Credential Manager' }), []);
  assert.equal(secretFinding('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), 'a GitHub token');
  assert.equal(secretFinding('password: <ask>'), null);
});

test('helpers: author family, tag counts, tag parsing, ago', () => {
  assert.equal(authorFamily('goal 84495326'), 'goal');
  assert.equal(authorFamily('agent prg#1'), 'agent');
  assert.equal(authorFamily('operator'), 'operator');
  assert.deepEqual(tagCounts(entries).slice(0, 2), [{ tag: 'repo:prg', n: 2 }, { tag: 'machine:HUB', n: 1 }]);
  assert.deepEqual(parseTags(' repo:prg, machine:HUB ,repo:prg,,'), ['repo:prg', 'machine:HUB']);
  assert.equal(ago(0), 'never');
  assert.equal(ago(1000, 1000 + 2 * 86_400_000), '2 d ago');
});
