// openspec harness-tabs-left-window (fleet task d3af3b9b) — the REAL first-run flow, which needs a tab DRAG:
// first click → the host opens beside the dashboard → the Operator drags it into the left window. CDP cannot
// move a tab between windows, so a TEST-ONLY extension (drag-ext/, chrome.tabs.move = what a drag does: same
// browsing context, name and opener) does the drag, and reports each window's ACTIVE tab (chrome.tabs) — the
// ground truth for "raised". Branded Chrome no longer loads unpacked extensions from the command line, so this
// scenario runs on Playwright's Chromium. Env from lab.ps1: HUB, PEER, HUBPW, PEERPW, SID, OUT.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { HUB, PEER, HUBPW, PEERPW, SID, OUT } = process.env;
const MANAGE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/?tab=status&layout=tabs`;
const A = '|ae8044a1e95a40c7b6224212caab1018', B = '|c38877a6a0eb424998e6a1b24da8f7bb', C = `${SID}|1a3d3a8bef5c48e79fd077d0f28ff87f`;
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 160) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 15000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ext = path.join(OUT, 'drag-ext');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-leftwin-drag-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: false, viewport: null,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--window-position=960,0', '--window-size=960,1000'],
});
await ctx.addInitScript(() => { try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {} });
// Screenshots/IDs only — but keep conversations unreadable all the same (the lab copies the live store).
await ctx.addInitScript(() => { const add = () => { const s = document.createElement('style'); s.textContent = '.phone__path, .msg, .tools, textarea, .arch__msg, .gp__ev, .chat__pinned, .chat__pinned-text, .fs__stale, .kb__card-title { filter: blur(6px) !important; } .phone__path { visibility: hidden !important; }'; (document.head || document.documentElement).appendChild(s); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add(); });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const active = () => sw.evaluate(() => self.activeTabs());
const isActive = async (part) => !!(await until(async () => ((await active()).some((t) => (t.url || '').includes(part)) ? true : null), 4000, 200));
const winOf = async (p) => { const s = await ctx.newCDPSession(p); try { return (await s.send('Browser.getWindowForTarget')).windowId; } finally { await s.detach().catch(() => {}); } };
const agentTag = new WeakMap();
ctx.on('page', (p) => p.on('framenavigated', (f) => { if (f === p.mainFrame()) { const m = /[?&]agent=([^&]+)/.exec(f.url()); if (m && !agentTag.has(p)) agentTag.set(p, decodeURIComponent(m[1])); } }));
const agentTabs = (repo) => ctx.pages().filter((p) => !p.isClosed() && (agentTag.get(p) || '').startsWith(repo));

let dash = ctx.pages()[0] || await ctx.newPage();
check('logs in at the hub and the peer', (await ctx.request.post(`${HUB}/api/auth/login`, { data: { password: HUBPW } })).ok() && (await ctx.request.post(`${PEER}/api/auth/login`, { data: { password: PEERPW } })).ok());
await dash.goto(MANAGE);
const R = await winOf(dash);
const s0 = await ctx.newCDPSession(dash);
const [left] = await Promise.all([ctx.waitForEvent('page'), s0.send('Target.createTarget', { url: 'data:text/html,<title>left</title>LEFT window', newWindow: true })]);
await s0.detach();
const L = await winOf(left);
{ const s = await ctx.newCDPSession(left); await s.send('Browser.setWindowBounds', { windowId: L, bounds: { left: 0, top: 0, width: 960, height: 1000 } }); await s.detach(); }
{ const s = await ctx.newCDPSession(dash); await s.send('Browser.setWindowBounds', { windowId: R, bounds: { left: 960, top: 0, width: 960, height: 1000 } }); await s.detach(); }
check('two windows: LEFT (empty) and RIGHT (dashboard)', L !== R);
const row = (k) => dash.locator(`[data-dblclick-harness="${k}"]`).first();
await until(async () => (await row(A).count()) && (await row(C).count()), 45000, 1000);
const toastNow = () => dash.locator('[data-open-notice]').last().getAttribute('data-open-notice').catch(() => null);
const open = async (k) => { await dash.bringToFront(); await row(k).dblclick(); await sleep(1300); return until(toastNow, 4000, 200); };

check('D1 first click: the host opens beside the dashboard (host-created), the agent waits', (await open(A)) === 'host-created' && agentTabs('ae8044a1').length === 0);
const dragged = await sw.evaluate(() => self.dragTab('launcher=1', 'LEFT window'));
check('D2 the Operator drags the host tab into the LEFT window', dragged.ok, JSON.stringify(dragged));
const a = await until(() => agentTabs('ae8044a1')[0], 10000);
check('D3 the queued agent A opens in LEFT the moment the host is moved', a && (await winOf(a)) === L);
if (!a) { console.log('@@LEFTWIN-DRAG@@ FAILED at D3'); await ctx.close(); process.exit(1); }
await a.evaluate(() => { window.__mark = 'kept'; });
check('D4 C (remote peer) opens in LEFT', (await open(C)) === 'left-opened' && (await winOf(await until(() => agentTabs('1a3d3a8b')[0]))) === L);
await sleep(1500);   // let C (just opened, cross-origin) finish loading first
const t5 = await open(A);
const act5 = await active();
check('D5 re-click A: left-focused — A is now the ACTIVE tab of LEFT (chrome.tabs), not reloaded', t5 === 'left-focused' && act5.some((t) => t.windowId === dragged.to && /127\.0\.0\.1:\d+\/studio/.test(t.url)) && (await a.evaluate(() => window.__mark)) === 'kept', JSON.stringify(act5));
await dash.reload(); await row(C).waitFor({ timeout: 30000 });
const t6 = await open(C);
check('D6 after F5 on the dashboard: re-click C raises it (the remote tab is LEFT\'s active tab)', t6 === 'left-focused' && await isActive(new URL(PEER).host), `${t6} ${JSON.stringify(await active())}`);
// a harness restart as Chrome sees it: the dashboard's reload lands on an error page, then the Operator reloads
await dash.goto('http://127.0.0.1:9/').catch(() => {});
await sleep(800);
await dash.goto(MANAGE).catch(() => {});
dash = ctx.pages().find((p) => !p.isClosed() && p.url().includes('/manage/') && !p.url().includes('launcher=1')) || dash;
await row(A).waitFor({ timeout: 30000 });
const strays0 = (await Promise.all(ctx.pages().map(async (p) => (!p.isClosed() && (await winOf(p)) === R ? p : null)))).filter(Boolean).length;
const t7 = await open(A);
const strays1 = (await Promise.all(ctx.pages().map(async (p) => (!p.isClosed() && (await winOf(p)) === R ? p : null)))).filter(Boolean).length;
check('D7 after an ERROR-PAGE reload (new browsing-context group): A is still handled in LEFT, steered not raised, no tab left behind in RIGHT', /^left-(steered|focused)$/.test(t7) && (await winOf(a)) === L && strays1 === strays0 && agentTabs('ae8044a1').length === 1, `${t7}; RIGHT tabs ${strays0} -> ${strays1}`);
out.d7 = t7;
const t8 = await open(B);
check('D8 …and a NEW agent B still opens in LEFT', t8 === 'left-opened' && (await winOf(await until(() => agentTabs('c38877a6')[0]))) === L, t8);

fs.writeFileSync(path.join(OUT, 'result-drag.json'), JSON.stringify(out, null, 2));
console.log(`@@LEFTWIN-DRAG@@ ${out.failed ? 'FAILED' : 'OK'} ${out.checks.filter((x) => x.ok).length}/${out.checks.length}`);
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
