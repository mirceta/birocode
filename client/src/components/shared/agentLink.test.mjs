// node --test — the open-agent contract (openspec status-open-agent-anywhere, fleet task 608f281a):
// how a request names an agent, and what the opener does with the handle window.open gave it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRepoForAgent, agentOfUrl, parseOpenAgentMessage, OPEN_AGENT_MESSAGE, OPEN_AGENT_ACK, OPEN_AGENT_EVENT } from './agentLink.js';
import { openPlan, isHarnessShellHref, focusAgentTab, DASHBOARD_TAB_NAME, agentTabName } from './workerWindow.js';

const repos = [
  { id: 'f28d758debf149a2bc58215099520572', name: 'pers-dec', handle: 'pers-dec' },
  { id: '3782af1ba7b8490db102a27ec340f9a5', name: 'web-flow-autodev', handle: 'web-flow-autodev#2' },
];

test('a request names a repo by id, else by handle or name, case-insensitively', () => {
  assert.equal(findRepoForAgent(repos, 'f28d758debf149a2bc58215099520572').name, 'pers-dec');
  assert.equal(findRepoForAgent(repos, 'Web-Flow-Autodev#2').name, 'web-flow-autodev');
  assert.equal(findRepoForAgent(repos, ' PERS-DEC ').name, 'pers-dec');
  assert.equal(findRepoForAgent(repos, 'nope'), null);
  assert.equal(findRepoForAgent(repos, ''), null);
  assert.equal(findRepoForAgent(null, 'pers-dec'), null);
});

test('the agent of a studio deep link, and a well-formed open-agent message', () => {
  assert.equal(agentOfUrl('http://192.168.0.101:5099/studio?agent=f28d758debf149a2bc58215099520572'), 'f28d758debf149a2bc58215099520572');
  assert.equal(agentOfUrl('/studio?agent=pers-dec'), 'pers-dec');
  assert.equal(agentOfUrl('/studio'), null);
  assert.deepEqual(parseOpenAgentMessage({ type: OPEN_AGENT_MESSAGE, agent: ' x ' }), { agent: 'x' });
  assert.equal(parseOpenAgentMessage({ type: OPEN_AGENT_ACK, agent: 'x' }), null);
  assert.equal(parseOpenAgentMessage({ type: OPEN_AGENT_MESSAGE, agent: 7 }), null);
  assert.equal(parseOpenAgentMessage(null), null);
});

test('only the studio can be steered; parked pages, Local-tab apps and the dashboard cannot', () => {
  assert.ok(isHarnessShellHref('http://h:5099/studio'));
  assert.ok(isHarnessShellHref('http://h:5099/studio/agent'));
  assert.ok(isHarnessShellHref('http://h:5099/studio?x=1'));
  assert.ok(!isHarnessShellHref('http://h:5099/api/health'));
  assert.ok(!isHarnessShellHref('http://h:5099/api/localview/abc/app/events-feed/manage/?tab=status'));
  assert.ok(!isHarnessShellHref('http://h:5099/'));
  assert.ok(!isHarnessShellHref('about:blank'));
});

test('the plan for the handle window.open returned', () => {
  assert.equal(openPlan({ handle: null }), 'blocked');
  assert.equal(openPlan({ handle: {}, self: true, href: 'http://h/api/localview/x/app/events-feed/manage/' }), 'self');
  assert.equal(openPlan({ handle: {}, self: false, href: 'about:blank' }), 'fresh');
  assert.equal(openPlan({ handle: {}, self: false, href: 'http://h:5099/api/health' }), 'renavigate');
  assert.equal(openPlan({ handle: {}, self: false, href: 'http://h:5099/studio/agent' }), 'steer');
  assert.equal(openPlan({ handle: {}, self: false, href: null }), 'steer');   // cross-origin: another machine's harness
});

// A fake window: what the opener did, and what it announced.
function fakeWindow({ handle, selfHandle = false, href, storage = {} } = {}) {
  const events = []; const listeners = {};
  const win = {
    name: '', opened: [], timers: [],
    document: { visibilityState: 'visible', hasFocus: () => true },
    open(url, name) { win.opened.push({ url, name }); if (selfHandle && url === '') return win; return handle === undefined ? null : handle; },
    dispatchEvent(e) { events.push(e); return true; },
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    setTimeout(f) { win.timers.push(f); return 1; },
    focus() { win.focused = true; },
  };
  win.events = events; win.listeners = listeners;
  return win;
}
const h = (href) => { const o = { focused: 0, posted: [], location: { href }, focus() { o.focused++; }, postMessage(m, t) { o.posted.push({ m, t }); } }; return o; };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const URL_ = 'http://h:5099/studio?agent=f28d758debf149a2bc58215099520572';
const last = (win) => win.events[win.events.length - 1].detail;

test('a brand-new tab is navigated to the agent and reported as opened', () => {
  const handle = h('about:blank'); const win = fakeWindow({ handle });
  assert.ok(focusAgentTab('|f28d', URL_, 'pers-dec', win));
  assert.equal(handle.location.href, URL_);
  assert.equal(last(win).result, 'opened'); assert.equal(last(win).label, 'pers-dec');
});

test('the dashboard living in the agent\'s own named tab gives the name back and opens the agent beside it (the pers-dec case)', () => {
  const win = fakeWindow({ selfHandle: true, handle: h('about:blank') });
  assert.ok(focusAgentTab('|f28d', URL_, 'pers-dec', win));
  assert.equal(win.name, DASHBOARD_TAB_NAME);
  assert.deepEqual(win.opened.map((o) => o.url), ['', URL_]);
  assert.equal(win.opened[1].name, agentTabName('|f28d'));
  assert.equal(last(win).result, 'self-reopened');
});

test('a tab parked on another page is sent back to the agent', () => {
  const handle = h('http://h:5099/api/health'); const win = fakeWindow({ handle });
  focusAgentTab('|f28d', URL_, 'pers-dec', win);
  assert.equal(handle.location.href, URL_);
  assert.equal(last(win).result, 'renavigated');
});

test('a tab on the studio is asked to show the agent; the answer (or its absence) is reported with whether it came to the front', () => {
  const handle = h('http://h:5099/studio/agent'); const win = fakeWindow({ handle });
  focusAgentTab('|f28d', URL_, 'pers-dec', win);
  assert.equal(handle.location.href, 'http://h:5099/studio/agent');           // never reloaded
  assert.deepEqual(handle.posted[0].m, { type: OPEN_AGENT_MESSAGE, agent: 'f28d758debf149a2bc58215099520572' });
  assert.equal(handle.focused, 1);
  assert.equal(win.events.length, 0);                                            // nothing said yet
  // the harness answers, and the dashboard lost the foreground → steered + raised
  win.listeners.message[0]({ source: handle, data: { type: OPEN_AGENT_ACK, agent: 'x', ok: true } });
  win.document.hasFocus = () => false;
  win.timers[0]();
  assert.deepEqual([last(win).result, last(win).raised], ['steered', true]);
  // no answer and the dashboard kept the foreground → silent, not raised
  const handle2 = h('http://h:5099/studio'); const win2 = fakeWindow({ handle: handle2 });
  focusAgentTab('|f28d', URL_, 'pers-dec', win2);
  win2.timers[0]();
  assert.deepEqual([last(win2).result, last(win2).raised], ['silent', false]);
  assert.equal(win2.listeners.message.length, 0);                                // listener removed
});

test('another machine\'s harness (cross-origin handle) is steered too, never navigated', () => {
  const handle = { focused: 0, posted: [], focus() { this.focused++; }, postMessage(m, t) { this.posted.push({ m, t }); } };
  Object.defineProperty(handle, 'location', { get() { throw new Error('cross-origin'); } });
  const win = fakeWindow({ handle });
  focusAgentTab('src1|r9', 'http://192.168.0.215:5099/studio?agent=r9', 'prg', win);
  assert.equal(handle.posted[0].m.agent, 'r9');
  win.timers[0]();
  assert.equal(last(win).result, 'silent');
});

test('a blocked pop-up is reported, not swallowed', () => {
  const win = fakeWindow({});
  assert.equal(focusAgentTab('|f28d', URL_, 'pers-dec', win), false);
  assert.equal(last(win).result, 'blocked');
  assert.equal(last(win).url, URL_);
  assert.equal(OPEN_AGENT_EVENT, 'birocode:agent-open');
});
