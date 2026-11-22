import test from 'node:test';
import assert from 'node:assert/strict';
import { flatRows, harnessCount, tone, attention, summary, filterRows, canAutostart, flagBody, ago } from './localAppsModel.js';

const machines = [
  { machine: 'HUB', self: true, reachable: true, overview: { rows: [
    { repoId: 'r1', repo: 'pers-dec', appId: 'homepage', name: 'homepage', kind: 'repo', port: 28166, startCommand: 'node serve.mjs', startSource: 'discovered', flag: { autostart: true, order: 1 }, state: 'up' },
    { repoId: 'r1', repo: 'pers-dec', appId: 'robo', name: 'robo fleet', kind: 'repo', port: 28167, startCommand: null, flag: null, state: 'stopped' },
    { repoId: 'r1', repo: 'pers-dec', appId: 'understanding', name: 'Understanding', kind: 'harness', port: 0, flag: null, state: 'always-on' },
  ] } },
  { machine: 'spacex', self: false, reachable: true, overview: { rows: [
    { repoId: 'r9', repo: 'msg-platform-agent', appId: 'admin', name: 'admin', kind: 'repo', port: 28180, startCommand: 'wscript launch.vbs', startSource: 'entry', flag: { autostart: true, startCommand: 'wscript launch.vbs', healthUrl: 'http://127.0.0.1:28180/health' }, state: 'failing', lastError: 'HTTP 500' },
    { repoId: 'r9', repo: 'msg-platform-agent', appId: 'hook', name: 'hook', kind: 'repo', port: 28181, startCommand: 'node hook.mjs', startSource: 'discovered', flag: { autostart: true }, state: 'down' },
  ] } },
  { machine: 'old-box', self: false, reachable: true, overview: null, status: 'no-peer-api' },
];

test('rows are flat with their machine; harness-served apps are counted, not listed; a machine without data adds none', () => {
  const rows = flatRows(machines);
  assert.equal(rows.length, 4);
  assert.equal(flatRows(machines, { includeHarness: true }).length, 5);
  assert.equal(harnessCount(machines[0]), 1);
  assert.deepEqual([...new Set(rows.map((r) => r.machine))], ['HUB', 'spacex']);
  assert.equal(rows[2].self, false);
});

test('the badge counts flagged apps that are down or failing; summary counts per state', () => {
  assert.equal(attention(machines), 2);
  assert.deepEqual(summary(machines), { flagged: 3, up: 1, starting: 0, down: 1, failing: 1, unknown: 0 });
  assert.equal(tone('failing'), 'bad');
  assert.equal(tone('down'), 'warn');
  assert.equal(tone('running'), 'ok');
  assert.equal(tone('stopped'), 'off');
});

test('filter: flagged only, and free text over machine / agent / app / port / command', () => {
  const rows = flatRows(machines);
  assert.equal(filterRows(rows, { flaggedOnly: true }).length, 3);
  assert.deepEqual(filterRows(rows, { q: 'spacex' }).map((r) => r.appId), ['admin', 'hook']);
  assert.deepEqual(filterRows(rows, { q: '28167' }).map((r) => r.appId), ['robo']);
  assert.deepEqual(filterRows(rows, { q: 'vbs' }).map((r) => r.appId), ['admin']);
});

test('only a repo app with a start command (its own or typed now) can be flagged', () => {
  const rows = flatRows(machines, { includeHarness: true });
  assert.equal(canAutostart(rows[0]).ok, true);
  assert.equal(canAutostart(rows[1]).ok, false);
  assert.equal(canAutostart(rows[1], 'node robo.mjs').ok, true);
  assert.match(canAutostart(rows[2]).why, /always on/);
});

test('the PUT body keeps the entry, applies the change, never copies a discovered command into the entry', () => {
  const rows = flatRows(machines, { includeHarness: true });
  assert.deepEqual(flagBody(rows[0], { autostart: false }), { machine: 'self', repoId: 'r1', appId: 'homepage', autostart: false, healthUrl: null, expectStatus: null, order: 1, delaySec: 0, startCommand: null, folder: null });
  const admin = flagBody(rows[3], { delaySec: '5', expectStatus: '' });
  assert.equal(admin.machine, 'spacex');
  assert.equal(admin.startCommand, 'wscript launch.vbs');   // the entry's own command is kept
  assert.equal(admin.healthUrl, 'http://127.0.0.1:28180/health');
  assert.equal(admin.delaySec, 5);
  assert.equal(admin.expectStatus, null);
  assert.equal(flagBody(rows[1], { startCommand: 'node robo.mjs', autostart: true }).startCommand, 'node robo.mjs');
});

test('ago', () => {
  assert.equal(ago(null), '—');
  assert.equal(ago(1000, 3000), 'just now');
  assert.equal(ago(0 + 1, 1 + 5 * 60_000), '5 min ago');
});
