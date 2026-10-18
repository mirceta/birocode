// node --test — harness tabs land in the other Chrome window (openspec harness-tabs-left-window, fleet
// task d3af3b9b): the placement setting, the window guard, the host pick, the host URL + pending agent,
// and the whole dashboard <-> host conversation over a fake BroadcastChannel bus shared by fake windows
// (dashboard reloads = a brand-new dashboard window object on the same bus). The Chrome behaviour behind
// it is pinned in .claudeweb-preview/playwright/check-left-window*.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rectOf, sameWindow, pickHost, hostUrl, isHostPage, parsePending, openInLeftWindow, installHost, HOST_TAB_NAME } from './harnessHost.js';
import { readPlacement, savePlacement, PLACEMENT_KEY } from './harnessWindow.js';
import { focusAgentTab, agentTabName } from './workerWindow.js';
import { openNoticeText } from '../../manage/openNotice.js';

const storage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('placement: "left" by default, "tabs" when chosen; the retired "window" mode and the old key read as left', () => {
  assert.equal(readPlacement(storage()).mode, 'left');
  assert.equal(readPlacement(storage({ 'manageapp.harnessWindow': JSON.stringify({ mode: 'tabs' }) })).mode, 'left');
  const s = storage();
  assert.deepEqual(savePlacement({ mode: 'tabs' }, s), { mode: 'tabs' });
  assert.equal(readPlacement(s).mode, 'tabs');
  savePlacement({ mode: 'window', viewer: 'single' }, s);
  assert.equal(readPlacement(s).mode, 'left');
  assert.equal(readPlacement(storage({ [PLACEMENT_KEY]: '{broken' })).mode, 'left');
});

test('the window guard: tabs of one Chrome window share its rectangle; unknown never counts as the same', () => {
  const r = rectOf({ screenX: 1920, screenY: 0, outerWidth: 1920, outerHeight: 1040 });
  assert.deepEqual(r, { x: 1920, y: 0, w: 1920, h: 1040 });
  assert.equal(sameWindow(r, { x: 1921, y: 1, w: 1920, h: 1040 }), true);
  assert.equal(sameWindow(r, { x: 0, y: 0, w: 1920, h: 1040 }), false);
  assert.equal(sameWindow(r, null), false);
  assert.equal(sameWindow(r, { x: null, y: 0, w: 1920, h: 1040 }), false);
});

test('the host pick: the newest host outside the dashboard window; else one inside, to queue on', () => {
  const dash = { x: 1920, y: 0, w: 1920, h: 1040 };
  const left = { x: 0, y: 0, w: 1920, h: 1040 };
  assert.deepEqual(pickHost([], dash), { host: null, inDashboard: false });
  const p = pickHost([{ hostId: 'a', rect: dash, since: 9 }, { hostId: 'b', rect: left, since: 1 }, { hostId: 'c', rect: left, since: 5 }], dash);
  assert.equal(p.host.hostId, 'c'); assert.equal(p.inDashboard, false);
  const q = pickHost([{ hostId: 'a', rect: dash, since: 9 }], dash);
  assert.equal(q.host.hostId, 'a'); assert.equal(q.inDashboard, true);
});

test('the host URL is this page with ?launcher=1 (proxy prefix kept), the pending agent rides in the hash', () => {
  const win = { location: { origin: 'http://192.168.0.138:5099', pathname: '/api/localview/r1/app/events-feed/manage/index.html', search: '?tab=kanban' } };
  assert.equal(hostUrl(win), 'http://192.168.0.138:5099/api/localview/r1/app/events-feed/manage/index.html?launcher=1');
  const u = hostUrl(win, { name: 'birocode-agent-_r', url: 'http://h/studio?agent=r', label: 'pers-dec', dash: { x: 1, y: 2, w: 3, h: 4 } });
  const hash = u.slice(u.indexOf('#'));
  assert.deepEqual(parsePending(hash), { name: 'birocode-agent-_r', url: 'http://h/studio?agent=r', label: 'pers-dec', dash: { x: 1, y: 2, w: 3, h: 4 } });
  assert.equal(parsePending('#open=%7Bbroken'), null);
  assert.equal(parsePending(''), null);
  assert.equal(isHostPage({ location: { search: '?launcher=1' } }), true);
  assert.equal(isHostPage(win), false);
});

// ---- a fake browser: one BroadcastChannel bus, windows with rectangles, named tabs per window --------
function browser() {
  const listeners = new Set();
  class FakeChannel {
    constructor(name) { this.name = name; this.onmessage = null; this.closed = false; listeners.add(this); }
    postMessage(data) {
      const copy = JSON.parse(JSON.stringify(data));
      for (const l of [...listeners]) if (l !== this && !l.closed && l.name === this.name) queueMicrotask(() => l.onmessage?.({ data: copy }));
    }
    close() { this.closed = true; listeners.delete(this); }
  }
  const windows = [];
  const tabs = [];   // every tab ever opened: { name, href, win (OS window id), group, loads }
  let groups = 0;    // Chrome's browsing-context groups: a named lookup only finds tabs of the caller's group
  let popupsAllowed = true;
  const mk = (osWindow, rect, href = 'http://hub:5099/manage/index.html', { group = ++groups, session = new Map() } = {}) => {
    const u = new URL(href);
    const w = {
      osWindow, group, screenX: rect.x, screenY: rect.y, outerWidth: rect.w, outerHeight: rect.h,
      location: { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, href },
      history: { replaceState() {} },
      sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) },
      session,
      BroadcastChannel: FakeChannel,
      events: [],
      setTimeout: (f, ms) => { const t = setTimeout(f, Math.min(ms, 30)); t.unref?.(); return t; },
      dispatchEvent(e) { w.events.push(e.detail); return true; },
      addEventListener() {}, removeEventListener() {},
      closedSelf: false, close() { w.closedSelf = true; },
      // A tab this window opens lands in THIS window's OS window — the platform rule.
      open(url, name, gesture) {
        if (!popupsAllowed && !w.activation) return null;
        let t = tabs.find((x) => x.name === name && x.group === w.group && !x.closed);
        if (!t) { t = { name, href: 'about:blank', win: w.osWindow, group: w.group, opener: w, loads: 0, focused: 0, posted: [], closed: false }; tabs.push(t); }
        const handle = {
          get location() { return { get href() { return t.href; }, set href(v) { t.href = v; t.loads += 1; } }; },
          set location(v) { t.href = v; t.loads += 1; },
          focus() { t.focused += 1; }, postMessage(m) { t.posted.push(m); }, close() { t.closed = true; },
        };
        if (url) { t.href = url; t.loads += 1; }
        return handle;
      },
    };
    windows.push(w);
    return w;
  };
  return { mk, tabs: { get all() { return tabs; } }, live: () => tabs.filter((t) => !t.closed), windows, setPopups(v) { popupsAllowed = v; } };
}
const LEFT = { x: 0, y: 0, w: 1920, h: 1040 };
const RIGHT = { x: 1920, y: 0, w: 1920, h: 1040 };
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const fast = { waitMs: 60 };

test('three agents from the dashboard all land in the LEFT window; a re-click steers, never reloads (host opened by hand)', async () => {
  const b = browser();
  const host = b.mk('L', LEFT); installHost(host, null, { pollMs: 20 });
  const dash = b.mk('R', RIGHT);
  for (const k of ['a', 'b', 'c']) assert.equal(await openInLeftWindow({ name: `birocode-agent-${k}`, url: `http://hub:5099/studio?agent=${k}` }, dash, fast), 'opened');
  assert.deepEqual(b.live().map((t) => [t.name, t.win]), [['birocode-agent-a', 'L'], ['birocode-agent-b', 'L'], ['birocode-agent-c', 'L']]);
  // The host was opened by hand (another browsing-context group): the dashboard's by-name raise finds nothing,
  // its stray blank is closed at once, and this dashboard stops trying for that host.
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub:5099/studio?agent=a' }, dash, fast), 'steered');
  assert.equal(b.live().length, 3);
  const strays = () => b.tabs.all.filter((t) => t.win === 'R').length;
  assert.equal(strays(), 1);
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-b', url: 'http://hub:5099/studio?agent=b' }, dash, fast), 'steered');
  assert.equal(strays(), 1, 'no second flash');
  const a = b.live()[0];
  assert.equal(a.loads, 1); assert.ok(a.focused >= 2);
  assert.deepEqual(a.posted[0], { type: 'birocode:open-agent', agent: 'a', app: null });
});

test('a dashboard REFRESH (a brand-new page, no handles, no names) still lands left', async () => {
  const b = browser();
  const host = b.mk('L', LEFT); installHost(host, null, { pollMs: 20 });
  const before = b.mk('R', RIGHT);
  await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, before, fast);
  const after = b.mk('R', RIGHT);   // the reloaded dashboard: nothing carried over but the origin
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-b', url: 'http://hub/studio?agent=b' }, after, fast), 'opened');
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, after, fast), 'steered');
  assert.deepEqual(b.live().map((t) => t.win), ['L', 'L']);
});

test('a host the DASHBOARD created (same browsing-context group): a re-click raises the tab, also after F5; after an error-page reload it steers', async () => {
  const b = browser();
  const dash = b.mk('R', RIGHT);
  await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, dash, fast);
  const hostTab = b.live().find((t) => t.name === HOST_TAB_NAME);
  const host = b.mk('R', RIGHT, hostTab.href, { group: dash.group });
  installHost(host, null, { pollMs: 20 });
  // dragged into the left window
  Object.assign(host, { screenX: LEFT.x, screenY: LEFT.y, outerWidth: LEFT.w, outerHeight: LEFT.h, osWindow: 'L' });
  await tick(120);
  const a = b.live().find((t) => t.name === 'birocode-agent-a');
  assert.equal(a.win, 'L');
  const f0 = a.focused;
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, dash, fast), 'focused');
  assert.ok(a.focused > f0 + 1, 'raised by the dashboard too');
  // F5: same tab, same group, same sessionStorage
  const f5 = b.mk('R', RIGHT, undefined, { group: dash.group, session: dash.session });
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, f5, fast), 'focused');
  // reload through an error page: Chrome gives the tab a NEW group -> placement still left, raise not possible
  const swapped = b.mk('R', RIGHT, undefined, { session: dash.session });
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, swapped, fast), 'steered');
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-b', url: 'http://hub/studio?agent=b' }, swapped, fast), 'opened');
  assert.deepEqual(b.live().filter((t) => t.name.startsWith('birocode-agent-')).map((t) => t.win), ['L', 'L']);
});

test('no host yet: the click opens one beside the dashboard carrying the agent; nothing opens until it is dragged left', async () => {
  const b = browser();
  const dash = b.mk('R', RIGHT);
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a', label: 'pers-dec' }, dash, fast), 'host-created');
  const hostTab = b.live().find((t) => t.name === HOST_TAB_NAME);
  assert.equal(hostTab.win, 'R');
  assert.match(hostTab.href, /\?launcher=1#open=/);
  // The host page boots in the dashboard's window ...
  const host = b.mk('R', RIGHT, hostTab.href);
  const states = [];
  installHost(host, (s) => states.push(s), { pollMs: 20 });
  await tick(80);
  assert.equal(states.at(-1).inDashboard, true);
  assert.deepEqual(states.at(-1).queue.map((q) => q.label), ['pers-dec']);
  assert.equal(b.live().filter((t) => t.name === 'birocode-agent-a').length, 0);    // never in the dashboard's window
  // ... a second click while it is still there only queues ...
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-b', url: 'http://hub/studio?agent=b' }, dash, fast), 'queued');
  // ... the Operator drags it into the left window: the queue opens there.
  Object.assign(host, { screenX: LEFT.x, screenY: LEFT.y, outerWidth: LEFT.w, outerHeight: LEFT.h, osWindow: 'L' });
  host.open = b.mk('L', LEFT).open.bind(null);
  await tick(150);
  const agents = b.live().filter((t) => t.name.startsWith('birocode-agent-'));
  assert.deepEqual(agents.map((t) => [t.name, t.win]).sort(), [['birocode-agent-a', 'L'], ['birocode-agent-b', 'L']]);
  assert.equal(states.at(-1).queue.length, 0);
});

test('pop-ups blocked: the host keeps the agent as a button (its click opens it); the dashboard hears "blocked"', async () => {
  const b = browser();
  const host = b.mk('L', LEFT); const h = installHost(host, null, { pollMs: 20 });
  const dash = b.mk('R', RIGHT);
  b.setPopups(false);
  assert.equal(await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, dash, fast), 'blocked');
  assert.equal(b.live().length, 0);
  host.activation = true;                       // the Operator clicks "open here" on the host page
  assert.equal(h.openNow('birocode-agent-a'), 'opened');
  assert.deepEqual(b.live().map((t) => t.win), ['L']);
});

test('a stale host in the dashboard window hands its queue to a woken host in another window and closes', async () => {
  const b = browser();
  const dash = b.mk('R', RIGHT);
  await openInLeftWindow({ name: 'birocode-agent-a', url: 'http://hub/studio?agent=a' }, dash, fast);
  const fresh = b.mk('R', RIGHT, b.live()[0].href);
  installHost(fresh, null, { pollMs: 20 });
  await tick(40);
  const old = b.mk('L', LEFT); installHost(old, null, { pollMs: 20 });   // Chrome restored it lazily; it just woke up
  await tick(300);
  assert.equal(fresh.closedSelf, true);
  assert.deepEqual(b.live().filter((t) => t.name === 'birocode-agent-a').map((t) => t.win), ['L']);
});

test('focusAgentTab: "left" goes through the host and announces it; "tabs" opens beside the dashboard', async () => {
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  const b = browser();
  installHost(b.mk('L', LEFT), null, { pollMs: 20 });
  const dash = b.mk('R', RIGHT);
  globalThis.localStorage = storage();
  assert.equal(focusAgentTab('|r1', 'http://hub/studio?agent=r1', 'pers-dec', dash), true);
  await tick(600);
  assert.equal(dash.events.at(-1).result, 'left-opened');
  assert.deepEqual(b.live().map((t) => [t.name, t.win]), [[agentTabName('|r1'), 'L']]);
  savePlacement({ mode: 'tabs' }, globalThis.localStorage);
  focusAgentTab('|r2', 'http://hub/studio?agent=r2', 'other', dash);
  assert.deepEqual(b.live().at(-1).win, 'R');
  assert.equal(dash.events.at(-1).result, 'opened');
});

test('every host-route outcome has words; none of them offers to open in the dashboard window except a silent host', () => {
  for (const r of ['left-opened', 'left-focused', 'left-steered', 'left-blocked', 'left-queued', 'host-created', 'host-blocked', 'host-silent']) {
    const v = openNoticeText({ result: r, label: 'pers-dec' });
    assert.ok(v.text && !/^Could not open/.test(v.text), r);
    assert.equal(v.link, r === 'host-silent', r);
  }
});
