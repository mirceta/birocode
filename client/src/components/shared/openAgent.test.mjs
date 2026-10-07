// node --test — the one opener every surface uses (openspec open-agent-everywhere, fleet task 720b3e0c):
// machine resolution from the fleet status, the reasons it announces instead of doing nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentKeyOf, machineOf, resolveAgentTarget, openAgentHarness, rememberFleet, lastFleet } from './openAgent.js';
import { OPEN_AGENT_EVENT } from './agentLink.js';

const PERS = 'f28d758debf149a2bc58215099520572';
const fleet = { machines: [
  { machine: 'DESKTOP-POAPPP3', sourceId: 'self', self: true, reachable: true, address: null, agents: [{ repoId: PERS, name: 'pers-dec', handle: 'pers-dec' }] },
  { machine: 'spacex', sourceId: 'src-spacex', self: false, reachable: true, address: 'http://192.168.0.215:5099', agents: [{ repoId: 'r-prg', name: 'prg', handle: 'prg#2' }] },
  { machine: 'Pavlin', sourceId: 'src-pavlin', self: false, reachable: false, address: 'http://192.168.0.40:5099', agents: [] },
] };

test('the key is blank for this machine whether the card says null or "self"', () => {
  assert.equal(agentKeyOf(null, PERS), `|${PERS}`);
  assert.equal(agentKeyOf('self', PERS), `|${PERS}`);
  assert.equal(agentKeyOf('src-spacex', 'r-prg'), 'src-spacex|r-prg');
  assert.equal(machineOf(fleet, null).machine, 'DESKTOP-POAPPP3');
  assert.equal(machineOf(fleet, 'self').machine, 'DESKTOP-POAPPP3');
  assert.equal(machineOf(fleet, 'src-spacex').machine, 'spacex');
  assert.equal(machineOf(fleet, 'nope'), null);
});

test('card 10922cb3 (pers-dec, sourceId null) resolves to this machine and a studio deep link', () => {
  const t = resolveAgentTarget(fleet, null, PERS, '');
  assert.equal(t.reason, null);
  assert.equal(t.url, `/studio?agent=${PERS}`);
  assert.equal(t.agent.handle, 'pers-dec');
  const r = resolveAgentTarget(fleet, 'src-spacex', 'r-prg', '');
  assert.equal(r.url, 'http://192.168.0.215:5099/studio?agent=r-prg');
});

test('every way a target cannot be opened has a name', () => {
  assert.equal(resolveAgentTarget(null, null, PERS, '').reason, 'no-fleet');
  assert.equal(resolveAgentTarget(fleet, 'gone', 'r', '').reason, 'unknown-machine');
  assert.equal(resolveAgentTarget(fleet, 'src-spacex', 'r-other', '').reason, 'unknown-agent');
  const u = resolveAgentTarget(fleet, 'src-pavlin', 'r-x', '');
  assert.equal(u.reason, 'unreachable');                                    // opened anyway, with a warning
  assert.equal(u.url, 'http://192.168.0.40:5099/studio?agent=r-x');
  assert.equal(resolveAgentTarget({ machines: [{ machine: 'x', sourceId: 's', self: false, address: 'garbage' }] }, 's', 'r', '').reason, 'no-address');
});

// A fake window: what was opened, what was announced.
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const fakeWin = () => { const w = { events: [], opened: [], document: { visibilityState: 'visible', hasFocus: () => true }, dispatchEvent(e) { w.events.push(e.detail); return true; }, addEventListener() {}, removeEventListener() {}, setTimeout(f) { w.timers = [...(w.timers || []), f]; return 1; }, open(url, name) { w.opened.push({ url, name }); return { location: { href: 'about:blank' }, focus() {} }; }, focus() {} }; return w; };

test('an openable agent is handed to the tab opener with its label; the Kanban card path included', () => {
  const w = fakeWin();
  assert.ok(openAgentHarness({ sourceId: null, repoId: PERS, label: 'pers-dec' }, fleet, w));
  assert.equal(w.opened[0].name, `birocode-agent-_${PERS}`);
  assert.deepEqual([w.events[0].result, w.events[0].label], ['opened', 'pers-dec']);
});

test('a target that cannot be opened announces the reason and opens nothing', () => {
  const w = fakeWin();
  assert.equal(openAgentHarness({ sourceId: 'gone', repoId: 'r' }, fleet, w), false);
  assert.equal(w.opened.length, 0);
  assert.equal(w.events[0].result, 'unknown-machine');
  const w2 = fakeWin();
  assert.equal(openAgentHarness({ sourceId: null, repoId: PERS }, null, w2), false);
  assert.equal(w2.events[0].result, 'no-fleet');
  const w3 = fakeWin();
  assert.ok(openAgentHarness({ sourceId: 'src-pavlin', repoId: 'r-x', label: 'x' }, fleet, w3));   // unreachable: warned, then opened
  assert.deepEqual(w3.events.map((e) => e.result), ['unreachable', 'opened']);
});

test('the last fleet status any surface fetched is remembered for callers without one', () => {
  assert.equal(lastFleet(), null);
  rememberFleet({ nope: true });
  assert.equal(lastFleet(), null);
  rememberFleet(fleet);
  assert.equal(lastFleet(), fleet);
  const w = fakeWin();
  assert.ok(openAgentHarness({ sourceId: 'self', repoId: PERS }, undefined, w));
  assert.equal(w.events[0].result, 'opened');
  assert.equal(OPEN_AGENT_EVENT, 'birocode:agent-open');
});
