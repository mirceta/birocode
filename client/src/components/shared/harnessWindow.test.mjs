// node --test — where the Kanban badge links open (openspec management-settings-tab): the
// persisted placement, the features that place the dedicated window on a chosen screen,
// the screen summary, feasibility reporting, and the open/reuse/navigate/focus dance
// against a fake window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT_KEY, HARNESS_WINDOW_NAME, readPlacement, savePlacement, featuresFor, screenSummary, screenRecord, screenPicking, openInHarnessWindow, listScreens } from './harnessWindow.js';
import { focusAgentTab } from './workerWindow.js';

const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };
const LEFT = { label: 'DELL U2419H', left: -1920, top: 0, width: 1920, height: 1080, availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1040, isPrimary: false, isInternal: false };

test('the placement reads as tabs until saved; saving keeps only the screen fields we place with', () => {
  const s = storage();
  assert.deepEqual(readPlacement(s), { mode: 'tabs', viewer: 'tabs', screen: null });
  const saved = savePlacement({ mode: 'window', screen: { ...LEFT, devicePixelRatio: 2, orientation: {} } }, s);
  assert.equal(saved.mode, 'window');
  assert.equal(saved.screen.label, 'DELL U2419H');
  assert.equal('devicePixelRatio' in saved.screen, false);
  assert.deepEqual(readPlacement(s), saved);
  assert.ok(s.map.get(PLACEMENT_KEY).includes('"mode":"window"'));
  // Garbage / unknown modes read as tabs; a screen without a size is no screen.
  s.setItem(PLACEMENT_KEY, '{not json');
  assert.deepEqual(readPlacement(s), { mode: 'tabs', viewer: 'tabs', screen: null });
  s.setItem(PLACEMENT_KEY, JSON.stringify({ mode: 'sideways', screen: { label: 'x' } }));
  assert.deepEqual(readPlacement(s), { mode: 'tabs', viewer: 'tabs', screen: null });
  assert.equal(screenRecord({ label: '', width: 800 }), null);
  assert.deepEqual(readPlacement(null), { mode: 'tabs', viewer: 'tabs', screen: null });
});

test('the features place the window on the chosen screen’s work area, or a sized window on the current screen', () => {
  assert.equal(featuresFor(LEFT), 'popup=1,left=-1920,top=0,width=1920,height=1040');
  assert.equal(featuresFor({ left: 2560, top: 0, width: 1440, height: 900 }), 'popup=1,left=2560,top=0,width=1440,height=900');
  assert.equal(featuresFor(null), 'popup=1,left=0,top=0,width=1280,height=900');
});

test('a screen reads as one line', () => {
  assert.equal(screenSummary(LEFT), 'DELL U2419H · 1920×1080 at (-1920, 0)');
  assert.equal(screenSummary({ label: null, width: 1920, height: 1080, left: 0, top: 0, isPrimary: true, isInternal: true }), 'screen · 1920×1080 at (0, 0) · primary · built-in');
  assert.equal(screenSummary(null), '');
});

test('feasibility is reported honestly: secure context + the API + more than one screen', () => {
  assert.equal(screenPicking({ isSecureContext: false, screen: { isExtended: true } }).available, false);
  assert.match(screenPicking({ isSecureContext: false, screen: { isExtended: true } }).reason, /secure page/);
  assert.match(screenPicking({ isSecureContext: true, screen: {} }).reason, /no Window Management API/);
  const ok = screenPicking({ isSecureContext: true, screen: { isExtended: true }, getScreenDetails: async () => ({ screens: [LEFT] }) });
  assert.equal(ok.available, true);
  assert.equal(ok.reason, null);
  const one = screenPicking({ isSecureContext: true, screen: { isExtended: false }, getScreenDetails: async () => ({ screens: [] }) });
  assert.match(one.reason, /only one screen/);
  assert.equal(screenPicking(null).available, false);
});

test('listScreens maps the browser’s ScreenDetailed objects to records', async () => {
  const win = { getScreenDetails: async () => ({ screens: [LEFT, { label: 'laptop', left: 0, top: 0, width: 1536, height: 864, isPrimary: true, isInternal: true }, { label: 'broken' }] }) };
  const list = await listScreens(win);
  assert.equal(list.length, 2);
  assert.equal(list[1].label, 'laptop');
  assert.deepEqual(await listScreens({}), []);
});

function fakeWindow(existingHref = 'about:blank', blocked = false) {
  const calls = [];
  const handle = { location: { href: existingHref }, focused: 0, focus() { this.focused++; } };
  const win = { open: (url, name, features) => { calls.push({ url, name, features }); return blocked ? null : handle; }, calls, handle };
  return win;
}

test('openInHarnessWindow creates the named window with the screen’s features, navigates a fresh one and focuses it', () => {
  const win = fakeWindow();
  assert.equal(openInHarnessWindow('http://192.168.1.20:5099/studio?agent=prg', { mode: 'window', screen: LEFT }, win), true);
  assert.deepEqual(win.calls, [{ url: '', name: HARNESS_WINDOW_NAME, features: 'popup=1,left=-1920,top=0,width=1920,height=1040' }]);
  assert.equal(win.handle.location.href, 'http://192.168.1.20:5099/studio?agent=prg');
  assert.equal(win.handle.focused, 1);
  // Already showing that page: only focused, never reloaded.
  const same = fakeWindow('http://a/studio?agent=prg');
  openInHarnessWindow('http://a/studio?agent=prg', { mode: 'window', screen: null }, same);
  assert.equal(same.handle.location.href, 'http://a/studio?agent=prg');
  assert.equal(same.handle.focused, 1);
  // Showing another machine's harness (cross-origin: reading throws): navigated anyway.
  const other = fakeWindow();
  Object.defineProperty(other.handle, 'location', { get() { throw new Error('cross-origin'); }, configurable: true });
  assert.equal(openInHarnessWindow('http://b/studio?agent=x', { mode: 'window', screen: null }, other), true);
  // Popup blocked: false, nothing else.
  assert.equal(openInHarnessWindow('http://a/', { mode: 'window' }, fakeWindow('about:blank', true)), false);
  assert.equal(openInHarnessWindow('', { mode: 'window' }, fakeWindow()), false);
});

test('focusAgentTab honours the placement: per-agent tabs by default, the dedicated window when chosen', () => {
  const s = storage();
  globalThis.localStorage = s;
  const win = fakeWindow();
  globalThis.window = win;
  try {
    assert.equal(focusAgentTab('src|repo', 'http://a/studio?agent=repo'), true);
    assert.deepEqual(win.calls, [{ url: '', name: 'birocode-agent-src_repo', features: undefined }]);
    savePlacement({ mode: 'window', viewer: 'single', screen: LEFT }, s); // the single viewer; the per-agent-tabs viewer is pinned in harnessWindow.launcher.test.mjs
    assert.equal(focusAgentTab('src|repo', 'http://a/studio?agent=repo'), true);
    assert.deepEqual(win.calls[1], { url: '', name: HARNESS_WINDOW_NAME, features: 'popup=1,left=-1920,top=0,width=1920,height=1040' });
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
