// node --test — one tab per agent inside the harness window (openspec harness-window-agent-tabs):
// the viewer sub-setting, the launcher URL, the launcher hook (open once, focus after, never
// reload), the dashboard-side relay (find / create the launcher tab, await its hook, fall back
// when blocked) and focusAgentTab's three ways. The Chrome behaviour behind it is pinned in
// .claudeweb-preview/playwright/check-harness-tabs.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlacement, savePlacement, launcherUrl, isLauncherPage, installLauncher, openAgentViaLauncher, LAUNCHER_HOOK, HARNESS_WINDOW_NAME } from './harnessWindow.js';
import { focusAgentTab } from './workerWindow.js';

const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('the viewer sub-setting reads as tabs by default and survives a save', () => {
  const s = storage();
  assert.equal(readPlacement(s).viewer, 'tabs');
  savePlacement({ mode: 'window', viewer: 'single', screen: null }, s);
  assert.equal(readPlacement(s).viewer, 'single');
  savePlacement({ mode: 'window', viewer: 'sideways' }, s);
  assert.equal(readPlacement(s).viewer, 'tabs');
});

test('the launcher page is this very page with ?launcher=1, recognised by that query', () => {
  const win = { location: { origin: 'http://192.168.1.104:5099', pathname: '/api/localview/r1/app/events-feed/manage/index.html', search: '?tab=kanban' } };
  assert.equal(launcherUrl(win), 'http://192.168.1.104:5099/api/localview/r1/app/events-feed/manage/index.html?launcher=1');
  assert.equal(isLauncherPage(win), false);
  assert.equal(isLauncherPage({ location: { search: '?launcher=1' } }), true);
  assert.equal(launcherUrl(null), null);
});

function tabWindow() {
  // A window whose open() returns per-name handles: a fresh one first, the same one after.
  const tabs = new Map();
  const calls = [];
  const win = {
    open: (url, name, features) => {
      calls.push({ url, name, features });
      if (!tabs.has(name)) tabs.set(name, { name, location: { href: 'about:blank' }, focused: 0, loads: 0, focus() { this.focused++; } });
      const h = tabs.get(name);
      return h;
    },
    calls, tabs, setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
  return win;
}

test('the launcher hook opens an agent tab once and only focuses it afterwards — never reloads', () => {
  const win = tabWindow();
  const events = [];
  const hook = installLauncher(win, (e) => events.push(e));
  assert.equal(typeof win[LAUNCHER_HOOK], 'function');
  assert.equal(hook('birocode-agent-a', 'http://a/studio?agent=a'), 'opened');
  const a = win.tabs.get('birocode-agent-a');
  assert.equal(a.location.href, 'http://a/studio?agent=a');
  assert.equal(a.focused, 1);
  assert.equal(hook('birocode-agent-a', 'http://a/studio?agent=a'), 'focused');
  assert.equal(a.location.href, 'http://a/studio?agent=a'); // untouched: no reload
  assert.equal(a.focused, 2);
  assert.equal(hook('birocode-agent-b', 'http://b/studio?agent=b'), 'opened');
  assert.equal(win.tabs.size, 2);
  assert.deepEqual(events.map((e) => e.result), ['opened', 'focused', 'opened']);
  assert.equal(events.at(-1).opened.length, 2);
  assert.equal(events[1].opened[0].hits, 2);
  // A cross-origin handle (reading href throws) is an existing tab: focus only.
  const x = tabWindow();
  installLauncher(x);
  x.open('', 'birocode-agent-c'); // pre-create
  Object.defineProperty(x.tabs.get('birocode-agent-c'), 'location', { get() { throw new Error('cross-origin'); } });
  assert.equal(x[LAUNCHER_HOOK]('birocode-agent-c', 'http://c/'), 'focused');
  // Popup-blocked: reported, nothing else.
  const blocked = { open: () => null };
  installLauncher(blocked);
  assert.equal(blocked[LAUNCHER_HOOK]('birocode-agent-d', 'http://d/'), 'blocked');
  assert.equal(blocked[LAUNCHER_HOOK]('', 'http://d/'), 'blocked');
});

test('the relay creates the launcher tab (no features), waits for its hook, then asks it', async () => {
  const dash = tabWindow();
  dash.location = { origin: 'http://h', pathname: '/manage.html', search: '' };
  // The launcher handle: fresh at first; its hook "loads" 150 ms after navigation.
  const p = openAgentViaLauncher('birocode-agent-a', 'http://a/studio?agent=a', dash, { waitMs: 2000, stepMs: 20 });
  const launcher = dash.tabs.get(HARNESS_WINDOW_NAME);
  assert.ok(launcher);
  assert.equal(dash.calls[0].name, HARNESS_WINDOW_NAME);
  assert.equal(dash.calls[0].features, undefined);           // a plain tab: a popup could not hold tabs
  assert.equal(launcher.location.href, 'http://h/manage.html?launcher=1');
  const asked = [];
  setTimeout(() => { launcher[LAUNCHER_HOOK] = (n, u) => { asked.push([n, u]); return 'opened'; }; }, 150);
  assert.equal(await p, 'opened');
  assert.deepEqual(asked, [['birocode-agent-a', 'http://a/studio?agent=a']]);
  // An existing launcher answers at once; a blocked one says so; a silent one times out.
  launcher[LAUNCHER_HOOK] = () => 'focused';
  assert.equal(await openAgentViaLauncher('birocode-agent-a', 'http://a/', dash), 'focused');
  launcher[LAUNCHER_HOOK] = () => 'blocked';
  assert.equal(await openAgentViaLauncher('birocode-agent-a', 'http://a/', dash), 'blocked');
  delete launcher[LAUNCHER_HOOK];
  launcher.location.href = 'http://h/manage.html?launcher=1';
  assert.equal(await openAgentViaLauncher('birocode-agent-a', 'http://a/', dash, { waitMs: 60, stepMs: 20 }), 'no-launcher');
  assert.equal(await openAgentViaLauncher('birocode-agent-a', 'http://a/', { open: () => null }), 'blocked');
  assert.equal(await openAgentViaLauncher('', 'http://a/', dash), 'no-launcher');
});

test('focusAgentTab: window+tabs relays through the launcher; window+single navigates the viewer; tabs opens beside the dashboard', async () => {
  const s = storage();
  globalThis.localStorage = s;
  const win = tabWindow();
  win.location = { origin: 'http://h', pathname: '/manage.html', search: '' };
  win.dispatchEvent = () => true;
  globalThis.window = win;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  try {
    savePlacement({ mode: 'window', viewer: 'tabs' }, s);
    win.tabs.set(HARNESS_WINDOW_NAME, { name: HARNESS_WINDOW_NAME, location: { href: 'http://h/manage.html?launcher=1' }, focus() {}, [LAUNCHER_HOOK]: (n, u) => { win.relayed = [n, u]; return 'opened'; } });
    assert.equal(focusAgentTab('src|repo', 'http://a/studio?agent=repo'), true);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(win.relayed, ['birocode-agent-src_repo', 'http://a/studio?agent=repo']);
    assert.equal(win.tabs.has('birocode-agent-src_repo'), false);      // the DASHBOARD opened no agent tab itself
    // Blocked relay → the tab is opened beside the dashboard so the click still does something.
    win.tabs.get(HARNESS_WINDOW_NAME)[LAUNCHER_HOOK] = () => 'blocked';
    focusAgentTab('src|repo', 'http://a/studio?agent=repo');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(win.tabs.get('birocode-agent-src_repo').location.href, 'http://a/studio?agent=repo');
    // Single viewer: the placed window, navigated.
    savePlacement({ mode: 'window', viewer: 'single', screen: { left: 0, top: 0, width: 800, height: 600 } }, s);
    win.calls.length = 0;
    focusAgentTab('src|repo', 'http://a/studio?agent=repo');
    assert.equal(win.calls[0].name, HARNESS_WINDOW_NAME);
    assert.match(String(win.calls[0].features), /^popup=1,left=0,top=0,width=800,height=600$/);
  } finally {
    delete globalThis.window; delete globalThis.localStorage; delete globalThis.CustomEvent;
  }
});
