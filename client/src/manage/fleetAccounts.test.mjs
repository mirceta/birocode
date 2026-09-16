// openspec fleet-accounts-subtab: the Overview's per-machine Claude usage re-keyed by
// account — machines group under their account, the freshest capture's usage wins, the
// rows are the Overview's own usage rows, and an account only the hub's last-seen memory
// knows still renders, marked stale with when and where it was last seen.
// Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accountKey, accountsView, accountsSummary } from './fleetAccounts.js';
import { overviewGroups } from './fleetStatusTabs.js';

const NOW = 1_800_000_000_000;
const usage = (pct, fetchedAt) => ({ available: true, stale: false, fetchedAt, session: { percent: pct, resetsAt: null, severity: 'normal' }, weekly: { percent: 40, resetsAt: null, severity: 'normal' }, scopedWeekly: [] });
const machine = (name, sourceId, account, plan, pct, fetchedAtMs, extra = {}) => ({
  machine: name, sourceId, reachable: true, self: false,
  overview: { capturedAt: fetchedAtMs - 1000, claude: { installed: true, authenticated: true, account, plan, usage: usage(pct, new Date(fetchedAtMs).toISOString()) } },
  ...extra,
});

test('accountKey folds case and whitespace', () => {
  assert.equal(accountKey(' Me@X.com '), 'me@x.com');
  assert.equal(accountKey(null), '');
});

test('machines on the same account group together and the freshest capture supplies the usage', () => {
  const machines = [
    machine('hub', 'self', 'Me@X.com', 'Max', 24, NOW - 60_000, { self: true }),
    machine('spacex', 'src-a', 'me@x.com', 'Max', 31, NOW - 10_000),
    machine('laptop', 'src-b', 'other@y.com', 'Pro', 5, NOW - 30_000),
    { machine: 'dark', sourceId: 'src-c', reachable: false, overview: null },                                  // unreachable → nothing
    { machine: 'guest', sourceId: 'src-d', reachable: true, overview: { claude: { installed: true, authenticated: false } } },
  ];
  const v = accountsView(machines, [], NOW);
  assert.deepEqual(v.map((e) => e.account), ['Me@X.com', 'other@y.com']);
  const me = v[0];
  assert.equal(me.live, true);
  assert.deepEqual(me.machines.map((m) => m.machine), ['hub', 'spacex']);
  const fiveHour = me.rows.find((r) => r.label === '5-hour window');
  assert.equal(fiveHour.kind, 'meter');
  assert.equal(fiveHour.percent, 31);                                          // spacex fetched later
  assert.equal(me.plan, 'Max');
  assert.ok(me.rows.some((r) => r.label === 'Overview as of'));
});

test('the account rows are the Overview\'s own usage rows — same builder, same values', () => {
  const m = machine('hub', 'self', 'me@x.com', 'Max', 24, NOW - 60_000, { self: true });
  const fromOverview = overviewGroups(m.overview, m, NOW).find((g) => g.key === 'usage').rows;
  const fromAccounts = accountsView([m], [], NOW)[0].rows.filter((r) => r.label !== 'Overview as of');
  assert.deepEqual(fromAccounts, fromOverview);
});

test('an account nobody uses any more renders from the hub\'s last-seen memory, marked stale', () => {
  const machines = [machine('hub', 'self', 'me@x.com', 'Max', 24, NOW - 60_000, { self: true })];
  const lastSeen = [
    { key: 'me@x.com', account: 'me@x.com', plan: 'Max', usage: usage(99, new Date(NOW).toISOString()), capturedAt: NOW, lastSeenAt: NOW, machines: ['hub'] }, // live → the live entry wins
    { key: 'old@z.com', account: 'old@z.com', plan: 'Pro', usage: usage(77, new Date(NOW - 7_200_000).toISOString()), capturedAt: NOW - 7_200_000, lastSeenAt: NOW - 7_200_000, machines: ['laptop'] },
  ];
  const v = accountsView(machines, lastSeen, NOW);
  assert.deepEqual(v.map((e) => [e.account, e.live, e.stale]), [['me@x.com', true, false], ['old@z.com', false, true]]);
  const old = v[1];
  assert.equal(old.rows.find((r) => r.label === '5-hour window').percent, 77);   // last known state
  const seen = old.rows.find((r) => r.label === 'Last seen');
  assert.equal(seen.tone, 'unknown');
  assert.match(seen.value, /2 h/);
  assert.match(seen.value, /no fleet machine uses this account now/);
  assert.match(seen.value, /was on laptop/);
  assert.deepEqual(old.machines.map((m) => m.machine), ['laptop']);
  // The live entry's usage is the LIVE capture, not the memory's.
  assert.equal(v[0].rows.find((r) => r.label === '5-hour window').percent, 24);
});

test('summary counts accounts in use and remembered', () => {
  const v = accountsView([machine('hub', 'self', 'me@x.com', 'Max', 24, NOW - 60_000)], [{ key: 'old@z.com', account: 'old@z.com', plan: 'Pro', usage: null, lastSeenAt: NOW - 1000, machines: [] }], NOW);
  assert.equal(accountsSummary(v), '1 account in use · 1 remembered (no longer used)');
  assert.equal(accountsSummary([]), '0 accounts in use');
});
