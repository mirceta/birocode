// openspec fleet-status-panels: the per-machine tab selection (URL param wins, else the
// browser's saved choice, else agents) and the Overview field mapping (an older peer with
// no overview degrades every field to "n/a"). Pure — no DOM. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEET_TABS, FLEET_TAB_KEY, NA, UNKNOWN, STRIP_FIELDS, readFleetTab, shortVersion, overviewGroups, overviewLabels, overviewSummary, hostClock, resetLabel } from './fleetStatusTabs.js';

test('readFleetTab: URL param wins', () => {
  assert.equal(readFleetTab('?fleetTab=scoreboard', () => 'overview'), 'scoreboard');
});

test('readFleetTab: falls back to the saved choice, then to agents', () => {
  assert.equal(readFleetTab('', () => 'overview'), 'overview');
  assert.equal(readFleetTab('', () => null), 'agents');
  assert.equal(readFleetTab('?fleetTab=bogus', () => 'nope'), 'agents');
});

test('FLEET_TABS is exactly agents/overview/scoreboard in order', () => {
  assert.deepEqual(FLEET_TABS, ['agents', 'overview', 'scoreboard']);
});

test('shortVersion pulls the 7-hex commit from an informational version', () => {
  assert.equal(shortVersion('1.0.0+a288bb4eda7b6020bd96b89dea35a3e4b5dc6661'), 'a288bb4');
  assert.equal(shortVersion(null), NA);
});

test('overviewGroups: a modern peer surfaces its values', () => {
  const machine = { machine: 'RAZVOJ2016', version: '1.0.0+a288bb4x', gateOpen: true };
  const overview = {
    claude: { installed: true, authenticated: true, account: 'me@x.com', plan: 'Max' },
    github: { installed: true, authenticated: true, account: 'octocat', host: 'github.com' },
    host: { timeZoneId: 'Central European Standard Time', utcOffsetMinutes: 120 },
    admin: { supported: true, state: 'active' },
  };
  const groups = overviewGroups(overview, machine);
  const flat = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.label, r.value]));
  assert.equal(flat.Version, 'a288bb4');
  assert.equal(flat.Machine, 'RAZVOJ2016');
  assert.equal(flat['Host active'], 'yes');
  assert.equal(flat['Admin active'], 'active');
  assert.equal(flat.GitHub, 'octocat');
  assert.equal(flat.Claude, 'me@x.com');
  assert.equal(flat['Claude plan'], 'Max');
  assert.match(flat.Timezone, /UTC\+2/);
});

test('overviewGroups: an old peer (no overview) says every overview field is UNKNOWN and why', () => {
  const machine = { machine: 'OLDBOX', version: '1.0.0+deadbeefcafe0000000000000000000000000000', gateOpen: false, reachable: true };
  const groups = overviewGroups(null, machine);
  const flat = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.label, r]));
  // Fields that ride the fleet object still resolve; the overview-only ones are explicit unknowns.
  assert.equal(flat.Version.value, 'deadbee');
  assert.equal(flat.Machine.value, 'OLDBOX');
  assert.equal(flat['Host active'].value, 'no');
  for (const k of ['Timezone', 'Host time', 'Admin active', 'GitHub', 'Claude', '5-hour window', 'Weekly quota']) {
    assert.equal(flat[k].value, UNKNOWN.oldBuild, k);
    assert.equal(flat[k].tone, 'unknown', k);
  }
  // Unreachable: the reason names the transport state.
  const dark = overviewGroups(null, { ...machine, reachable: false, status: 'unreachable', detail: 'timeout' });
  const d = Object.fromEntries(dark.flatMap((g) => g.rows).map((r) => [r.label, r]));
  assert.match(d.Claude.value, /^unknown — machine not reachable \(unreachable: timeout\)/);
  assert.equal(d.Reachable.tone, 'bad');
});

test('overviewGroups: the honest overview carries the Claude plan usage meters, the host clock and the admin facts', () => {
  const now = Date.UTC(2026, 8, 7, 10, 30);
  const machine = { machine: 'SPACEX', version: '1.0.0+84cd5a8e', gateOpen: true, reachable: true, agents: [{}, {}], managedCount: 1, acceptsSends: true, acceptsUpgrades: false, allowSends: true, staleTasks: 0 };
  const overview = {
    capturedAt: now - 40_000,
    claude: { installed: true, authenticated: true, account: 'me@x.com', plan: 'Max', usage: {
      available: true, stale: false, fetchedAt: new Date(now - 120_000).toISOString(),
      session: { percent: 23.4, resetsAt: new Date(now + 3 * 3600e3).toISOString(), severity: 'normal' },
      weekly: { percent: 92, resetsAt: new Date(now + 3 * 86400e3).toISOString(), severity: 'normal' },
      scopedWeekly: [{ label: 'Opus', percent: 12, resetsAt: null, severity: 'elevated' }],
    } },
    github: { installed: true, authenticated: true, account: 'octocat', host: 'github.com' },
    host: { timeZoneId: 'Central Europe Standard Time', utcOffsetMinutes: 120, nowUnixMs: now, nowIso: 'x' },
    admin: { supported: true, state: 'reboot_pending', registrySet: true, elevated: false },
  };
  const groups = overviewGroups(overview, machine, now);
  const flat = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.label, r]));
  assert.equal(flat['5-hour window'].kind, 'meter');
  assert.equal(Math.round(flat['5-hour window'].percent), 23);
  assert.match(flat['5-hour window'].value, /^23% · resets /);
  assert.equal(flat['5-hour window'].tone, 'ok');
  assert.equal(flat['Weekly quota'].tone, 'bad');            // ≥ 90 %
  assert.equal(flat['Weekly · Opus'].tone, 'warn');           // severity elevated
  assert.match(flat['Usage freshness'].value, /^fetched 2 min ago/);
  assert.equal(flat['Host time'].value, '12:30 UTC+2');       // the peer's own clock in its zone
  assert.equal(flat.Date.value, 'Mon 7 Sep 2026');
  assert.equal(flat['Admin active'].value, 'reboot_pending');
  assert.equal(flat['Admin active'].tone, 'warn');
  assert.equal(flat['UAC policy set'].value, 'yes');
  assert.equal(flat['Harness elevated'].value, 'no');
  assert.equal(flat['Overview as of'].value, '40 s ago');
  assert.equal(flat.Agents.value, '2');
  assert.equal(flat['Accepts fleet upgrades'].value, 'no');
  assert.equal(flat['Sends allowed from here'].value, 'yes');
  assert.match(overviewSummary(groups), /^Max · 5h 23% · week 92% · 12:30 UTC\+2 · admin reboot_pending$/);
});

test('overviewGroups: usage is an explicit state in every case — no session, cold, predates, unavailable', () => {
  const base = { machine: 'M', version: 'v', gateOpen: true, reachable: true };
  const row = (ov) => Object.fromEntries(overviewGroups(ov, base).flatMap((g) => g.rows).map((r) => [r.label, r]))['5-hour window'];
  assert.equal(row({ claude: { installed: true, authenticated: false }, capturedAt: 1 }).value, UNKNOWN.noSession);
  assert.equal(row({ claude: { installed: true, authenticated: true, usage: null }, capturedAt: 1 }).value, UNKNOWN.cold);
  assert.equal(row({ claude: { installed: true, authenticated: true, usage: null } }).value, UNKNOWN.predates);
  const un = row({ claude: { installed: true, authenticated: true, usage: { available: false, error: 'session expired' } }, capturedAt: 1 });
  assert.equal(un.value, 'unavailable — session expired');
  assert.equal(un.tone, 'bad');
  assert.equal(row({ claude: null, capturedAt: 1 }).value, UNKNOWN.cold);
});

test('every field the header strip shows has an Overview row (the audit, executable)', () => {
  const machine = { machine: 'M', version: '1.0.0+abcdef0', gateOpen: true, reachable: true };
  const overview = { capturedAt: 1, claude: { installed: true, authenticated: true, account: 'a', plan: 'Pro', usage: { available: true, stale: false, session: { percent: 1 }, weekly: { percent: 2 }, scopedWeekly: [] } },
    github: { installed: true, authenticated: true, account: 'g', host: 'h' }, host: { timeZoneId: 'Z', utcOffsetMinutes: 0, nowUnixMs: 1 }, admin: { supported: true, state: 'active', registrySet: true, elevated: true } };
  const labels = new Set(overviewLabels(overviewGroups(overview, machine)));
  for (const [stripField, label] of STRIP_FIELDS) assert.ok(labels.has(label), `${stripField} → ${label}`);
});

test('hostClock renders a peer clock in its own offset; resetLabel names same-day and later resets', () => {
  const t = Date.UTC(2026, 8, 7, 22, 5);
  assert.deepEqual(hostClock(t, 120), { time: '00:05', date: 'Tue 8 Sep 2026' });
  assert.deepEqual(hostClock(t, -300), { time: '17:05', date: 'Mon 7 Sep 2026' });
  assert.equal(hostClock(undefined, 0), null);
  const now = Date.UTC(2026, 8, 7, 10, 0);
  assert.match(resetLabel(new Date(now + 3600e3).toISOString(), now), /^resets \d\d:\d\d$/);
  assert.match(resetLabel(new Date(now + 3 * 86400e3).toISOString(), now), /^resets \w{3} \d\d:\d\d$/);
  assert.equal(resetLabel('garbage', now), null);
});
