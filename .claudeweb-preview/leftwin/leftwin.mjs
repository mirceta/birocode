// openspec harness-tabs-left-window (fleet task d3af3b9b) — drives the lab (lab.ps1: HUB, PEER, HUBPW, PEERPW,
// SID, OUT from env) in REAL Chrome (channel 'chrome', headed) on this hub, with its own persistent profile
// (the Operator's own Chrome profile is never touched). Pop-ups are allowed for the hub's site the way the
// Operator allows them once (a site exception in the profile — Playwright's blanket --disable-popup-blocking
// is removed), and "Continue where you left off" is on so a Chrome restart restores the windows.
//
// Two windows: RIGHT = the Management dashboard, LEFT = the Operator's other window. Every agent is opened by
// double-clicking its row on the Status tab (the real openAgentHarness path every surface shares). After each
// step the active tab of each window is captured and composed into one frame (left | right) for the GIF.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { HUB, PEER, HUBPW, PEERPW, SID, OUT } = process.env;
const MANAGE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/?tab=status&layout=tabs`;
const AGENTS = { A: { key: '|ae8044a1e95a40c7b6224212caab1018', label: 'phone-agent (local)' }, B: { key: '|c38877a6a0eb424998e6a1b24da8f7bb', label: 'game-arcade (local)' }, C: { key: `${SID}|1a3d3a8bef5c48e79fd077d0f28ff87f`, label: 'msg-platform-agent (REMOTE peer)' } };
const out = { checks: [], frames: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 160) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 15000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-leftwin-chrome-'));
fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
const hubOrigin = new URL(HUB).origin;
fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
  session: { restore_on_startup: 1 },
  profile: { content_settings: { exceptions: { popups: { [`${hubOrigin},*`]: { setting: 1 } } } } },
}));
const launch = () => chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: false, viewport: null,
  ignoreDefaultArgs: ['--disable-popup-blocking', 'about:blank'],
  args: ['--window-position=960,0', '--window-size=960,1000'],
});
let ctx = await launch();
const prep = async (c) => {
  await c.addInitScript(() => { try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {} });
  // Screenshots go into a public repo: hide the dock's repo path (it carries the Windows profile name).
  await c.addInitScript(() => { const add = () => { const s = document.createElement('style'); s.textContent = '.phone__path, .msg, .tools, textarea, .arch__msg, .gp__ev, .chat__pinned, .chat__pinned-text, .fs__stale, .kb__card-title { filter: blur(6px) !important; } .phone__path { visibility: hidden !important; }'; (document.head || document.documentElement).appendChild(s); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add(); });
};
await prep(ctx);

const winOf = async (p) => { const s = await ctx.newCDPSession(p); try { return (await s.send('Browser.getWindowForTarget')).windowId; } finally { await s.detach().catch(() => {}); } };
const setBounds = async (p, b) => { const s = await ctx.newCDPSession(p); try { const { windowId } = await s.send('Browser.getWindowForTarget'); await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); await s.send('Browser.setWindowBounds', { windowId, bounds: b }); } finally { await s.detach().catch(() => {}); } };
const newWindow = async (url) => {
  const s = await ctx.newCDPSession(ctx.pages()[0]);
  const [p] = await Promise.all([ctx.waitForEvent('page'), s.send('Target.createTarget', { url, newWindow: true })]);
  await s.detach().catch(() => {});
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  await setBounds(p, { left: 0, top: 0, width: 960, height: 1000 });
  return p;
};
const pagesIn = async (wid) => { const r = []; for (const p of ctx.pages()) { if (p.isClosed()) continue; try { if ((await winOf(p)) === wid) r.push(p); } catch {} } return r; };
const isAgent = (p) => /\/studio\?agent=|\/studio\b/.test(p.url()) && !/launcher=1/.test(p.url());
const isHost = (p) => /[?&]launcher=1/.test(p.url());
const realFocus = async (c, p) => { try { const s = await c.newCDPSession(p); await s.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await s.detach(); } catch {} };
const front = async (p) => { const s = await ctx.newCDPSession(p); await s.send('Page.bringToFront'); await s.detach().catch(() => {}); };
const hasFocus = (p) => p.evaluate(() => document.hasFocus()).catch(() => false);
// "Raised" = p is the ACTIVE tab of its window. Only the OS-foreground window's active tab reports focus, and
// the click happened in the dashboard's window — so bring p's window forward without touching its tabs
// (minimize + restore), ask, then give the foreground back to the dashboard.
// A re-click outcome is honest when: 'left-focused' AND the tab really is LEFT's active one, or 'left-steered'
// (Chrome would not let the dashboard raise it — the toast says so).
// (Whether 'left-focused' really made the tab the ACTIVE one is proven by leftwin-drag.mjs from chrome.tabs — a page
// cannot learn it about itself under automation, see vis-probe in the PR.)
const honest = async (t, p) => (t === 'left-focused' || t === 'left-steered') && !p.isClosed();
const raised = async (p) => {
  await sleep(600);
  const s = await ctx.newCDPSession(p);
  try {
    const { windowId } = await s.send('Browser.getWindowForTarget');
    await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await sleep(300);
    await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  } finally { await s.detach().catch(() => {}); }
  const ok = await until(() => hasFocus(p), 3000, 150);
  if (!dash.isClosed()) await front(dash);
  return !!ok;
};
const tagPages = (c) => c.on('page', (p) => { realFocus(c, p); }) && c.on('page', (p) => p.on('framenavigated', (f) => { if (f === p.mainFrame()) { const m = /[?&]agent=([^&]+)/.exec(f.url()); if (m && !p.__agent) p.__agent = decodeURIComponent(m[1]); } }));
tagPages(ctx);
const agentPage = (repo) => ctx.pages().find((p) => !p.isClosed() && (p.__agent || '').startsWith(repo)) || null;
const agentTabs = (repo) => ctx.pages().filter((p) => !p.isClosed() && (p.__agent || '').startsWith(repo));
const visibleIn = async (wid) => { for (const p of await pagesIn(wid)) { try { if ((await p.evaluate(() => document.visibilityState)) === 'visible') return p; } catch {} } return null; };

let frameNo = 0;
// One frame = what each window shows right now: its visible tab, labelled, side by side.
// Page screenshots only (never the screen: other windows of the machine may sit on top). Each side shows the
// tab the checks proved active in that window — passed in explicitly; null = the window is closed.
async function frame(caption, lp, rp) {
  frameNo += 1;
  await sleep(400);
  const grab = async (p, side) => {
    if (!p || p.isClosed()) return { f: null, url: '(window closed)' };
    const f = path.join(SHOTS, `${String(frameNo).padStart(2, '0')}-${side}.png`);
    await p.screenshot({ path: f }).catch(() => {});
    return { f: fs.existsSync(f) ? f : null, url: p.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90), title: await p.title().catch(() => '') };
  };
  out.frames.push({ n: frameNo, caption, left: await grab(lp, 'L'), right: await grab(rp, 'R') });
  // A headed screenshot brings its tab to the front and turns Playwright's focus emulation back on: undo both
  // so the next raise check measures the harness, not the camera.
  for (const p of ctx.pages()) if (!p.isClosed()) await realFocus(ctx, p);
  if (!dash.isClosed()) await front(dash);
}

let dash = ctx.pages()[0] || await ctx.newPage();
await realFocus(ctx, dash);
await setBounds(dash, { left: 960, top: 0, width: 960, height: 1000 });
const errors = []; dash.on('pageerror', (e) => errors.push('dash: ' + e.message));
check('the dashboard logs in at the hub', (await ctx.request.post(`${HUB}/api/auth/login`, { data: { password: HUBPW } })).ok());
check('the browser also holds a session at the peer (as after one login there)', (await ctx.request.post(`${PEER}/api/auth/login`, { data: { password: PEERPW } })).ok());
await dash.goto(MANAGE);
const R = await winOf(dash);
const left = await newWindow('about:blank');
const L = await winOf(left);
check('two Chrome windows: LEFT and RIGHT (the dashboard) are different OS windows', L !== R, `L=${L} R=${R}`);
const row = (k) => dash.locator(`[data-dblclick-harness="${k}"]`).first();
check('the Status tab lists the three agents (two local, one on the remote peer)', await until(async () => (await row(AGENTS.A.key).count()) && (await row(AGENTS.B.key).count()) && (await row(AGENTS.C.key).count()), 45000, 1000));
const toast = async () => (await dash.locator('[data-open-notice]').last().getAttribute('data-open-notice').catch(() => null));
const lastToast = () => until(toast, 4000, 200);
const open = async (k) => { await row(AGENTS[k].key).dblclick(); await sleep(1200); };
await frame('start: LEFT is an empty window, RIGHT is the dashboard', left, dash);

// 1. first click, no host anywhere → the host is created beside the dashboard; nothing opens in RIGHT
await open('A');
check('1a first click with no host: the toast says "one-time setup" (host-created)', (await lastToast()) === 'host-created', await toast());
const host1 = await until(() => ctx.pages().find((p) => isHost(p) && !p.isClosed()));
check('1b the host tab was opened, beside the dashboard (RIGHT)', host1 && (await winOf(host1)) === R);
check('1c the agent did NOT open in the dashboard window', !agentPage('ae8044a1'));
if (host1) await front(host1); await sleep(400);
await frame('1. first click, no host yet: a host tab opens beside the dashboard and asks to be dragged left; the agent waits in it', left, host1);
await front(dash);
// The Operator puts the host into the LEFT window (CDP cannot drag a tab between windows, so the host is
// opened there by hand, as the Settings tab and the toast also offer): the queued host hands over + closes.
await left.goto(`${new URL(MANAGE).origin}${new URL(MANAGE).pathname}?launcher=1`);
const a = await until(() => agentPage('ae8044a1'), 15000);
check('1d host in the LEFT window: agent A opens there', a && (await winOf(a)) === L);
check('1e the stand-in host beside the dashboard handed over and closed itself', await until(() => host1.isClosed(), 8000));
await frame('1. host placed in LEFT: it opens agent A (phone-agent) there; the stand-in closed itself', a, dash);

// 2. B (local) and C (remote) — all left
await open('B');
const b = await until(() => agentPage('c38877a6'));
check('2a agent B (local) opens in LEFT, as its active tab', b && (await winOf(b)) === L && (await raised(b)), await toast());
await open('C');
const c = await until(() => ctx.pages().find((p) => !p.isClosed() && p.url().startsWith(PEER)), 15000);
check('2b agent C (REMOTE peer harness, another origin) opens in LEFT, as its active tab', c && (await winOf(c)) === L && (await raised(c)), c?.url());
check('2c the dashboard window holds no agent tab', (await pagesIn(R)).every((p) => !isAgent(p) && !p.url().startsWith(PEER)));
await frame('2. B (local game-arcade) and C (REMOTE peer msg-platform-agent) open in LEFT too', c, dash);

// 3. re-click A → focused (front), never reloaded
await a.evaluate(() => { window.__leftwinMarker = 'kept'; });
await open('A');
const t3 = await lastToast();
check('3a re-click: A handled in LEFT — left-focused (raised) or left-steered (Chrome forbade the raise); the raise itself is proven from chrome.tabs in the drag run', await honest(t3, a), t3);
check('3b …without a reload (in-page state kept)', (await a.evaluate(() => window.__leftwinMarker)) === 'kept');
check('3c …and no duplicate tab (LEFT still holds host + 3 agents)', agentTabs('ae8044a1').length === 1 && (await pagesIn(L)).length === 4, `agent A tabs ${agentTabs('ae8044a1').length}, LEFT tabs ${(await pagesIn(L)).length}`);
await frame('3. re-click A: handled in LEFT without a reload or a duplicate (raised where Chrome allows - proven from chrome.tabs in the drag run)', a, dash);

// 4. refresh the dashboard (F5), then a dashboard in a NEW tab (its own browsing-context group) → still left
await dash.reload(); await row(AGENTS.B.key).waitFor({ timeout: 30000 });
await open('B');
const t4a = await lastToast();
check('4a after a dashboard REFRESH: re-click B handled in LEFT (focused or steered), no new tab', (await honest(t4a, b)) && (await winOf(b)) === L && agentTabs('c38877a6').length === 1, t4a);
await frame('4. dashboard refreshed (F5): B still handled in LEFT', b, dash);
await front(dash); await sleep(300);
const dash2 = await ctx.newPage();
await dash2.goto(MANAGE);
check('4b a dashboard opened in a fresh tab is in the RIGHT window', (await winOf(dash2)) === R);
await dash.close(); dash = dash2;
await row(AGENTS.A.key).waitFor({ timeout: 30000 });
await open('A');
const t4c = await lastToast();
check('4c from the fresh dashboard tab (no opener, no names): A is handled in LEFT, no reload', (await honest(t4c, a)) && (await a.evaluate(() => window.__leftwinMarker)) === 'kept' && agentTabs('ae8044a1').length === 1, t4c);
check('4d no agent tab ever landed in RIGHT', (await pagesIn(R)).every((p) => !isAgent(p) && !p.url().startsWith(PEER)));
await frame('4. dashboard in a brand-new tab (no opener, no window names): A still handled in LEFT', a, dash);

// 5. close the LEFT window → click → handled: a host beside the dashboard asks to be placed, nothing opens in RIGHT
for (const p of await pagesIn(L)) await p.close();
await sleep(500);
await open('B');
check('5a LEFT window closed, click: "host-created" (one-time setup again)', (await lastToast()) === 'host-created', await toast());
check('5b nothing opened in the dashboard window but the host', (await pagesIn(R)).filter((p) => isAgent(p) || p.url().startsWith(PEER)).length === 0);
const host2 = ctx.pages().find((p) => isHost(p) && !p.isClosed());
if (host2) await front(host2); await sleep(300);
await frame('5. LEFT window closed: the click opens a host beside the dashboard, no agent in RIGHT', null, host2);
const left2 = await newWindow(`${new URL(MANAGE).origin}${new URL(MANAGE).pathname}?launcher=1`);
const L2 = await winOf(left2);
const b2 = await until(() => agentPage('c38877a6'), 15000);
check('5c new LEFT window with the host: the queued agent B opens there', b2 && (await winOf(b2)) === L2);
await open('A');
const a2 = await until(() => agentPage('ae8044a1'), 15000);
check('5d and A too', a2 && (await winOf(a2)) === L2);
await frame('5. a new LEFT window with the host: B and A open there', a2, dash);

// 5e. the host tab RELOADS (what a session restore does to it): it answers again and still knows its agent tabs
await left2.reload(); await sleep(800);
await open('B');
const t5e = await lastToast();
check('5e after the HOST tab reloads: re-click B is handled in LEFT, no duplicate', /^left-(focused|steered)$/.test(t5e) && agentTabs('c38877a6').length === 1 && (await winOf(b2)) === L2, `toast=${t5e}, B tabs ${agentTabs('c38877a6').length}`);

// 6. quit and reopen Chrome (same profile). Chrome under automation starts on a new-tab page instead of
// restoring the session, so this is the WORST case: nothing restored, no host anywhere.
await ctx.close();
await sleep(1500);
ctx = await launch();
tagPages(ctx);
await prep(ctx);
await sleep(2000);
out.restoredUrls = ctx.pages().map((p) => p.url());
check('6a Chrome reopened on the same profile (pop-up allowance and placement kept; the session was not restored)', true, out.restoredUrls.join(' | '));
dash = ctx.pages()[0] || await ctx.newPage();
await setBounds(dash, { left: 960, top: 0, width: 960, height: 1000 });
await dash.goto(MANAGE);
const RR = await winOf(dash);
await row(AGENTS.C.key).waitFor({ timeout: 45000 });
await open('C');
const t6 = await lastToast();
check('6b first click after the restart: "host-created" — the one-time step again, nothing opened in RIGHT', t6 === 'host-created' && (await pagesIn(RR)).every((p) => !p.url().startsWith(PEER)), t6);
const left3 = await newWindow(`${new URL(MANAGE).origin}${new URL(MANAGE).pathname}?launcher=1`);
const LR = await winOf(left3);
const c3 = await until(() => ctx.pages().find((p) => !p.isClosed() && p.url().startsWith(PEER)), 15000);
check('6c host placed in LEFT again: the remote agent C opens there', c3 && (await winOf(c3)) === LR);
await open('A');
const a3 = await until(() => agentPage('ae8044a1'), 15000);
check('6d and every later click lands there too', a3 && (await winOf(a3)) === LR, await toast());
await frame('6. Chrome reopened (nothing restored): the host placed once, then every click lands in LEFT again', a3, dash);

check('no page errors on the dashboard', errors.length === 0, errors.join(' | '));
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@LEFTWIN@@ ${out.failed ? 'FAILED' : 'OK'} ${out.checks.filter((x) => x.ok).length}/${out.checks.length}`);
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
