// openspec fleet-status-panels: the per-machine tab selection (URL param wins, else the
// browser's saved choice, else agents) and the Overview field mapping (an older peer with
// no overview degrades every field to "n/a"). Pure — no DOM. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFleetTab, overviewGroups, shortVersion, FLEET_TABS, NA } from './fleetStatusTabs.js';

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

test('overviewGroups: an old peer (no overview) degrades every account/host field to n/a', () => {
  const machine = { machine: 'OLDBOX', version: '1.0.0+deadbeefcafe0000000000000000000000000000', gateOpen: false };
  const groups = overviewGroups(null, machine);
  const flat = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.label, r.value]));
  // Fields that ride the fleet object still resolve; the overview-only ones are n/a.
  assert.equal(flat.Version, 'deadbee');
  assert.equal(flat.Machine, 'OLDBOX');
  assert.equal(flat['Host active'], 'no');
  assert.equal(flat.Timezone, NA);
  assert.equal(flat['Admin active'], NA);
  assert.equal(flat.GitHub, NA);
  assert.equal(flat.Claude, NA);
});
