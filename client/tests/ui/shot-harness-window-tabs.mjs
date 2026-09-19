// Evidence for openspec harness-window-agent-tabs (fleet task 9973393e): in "window" mode with
// the per-agent-tabs viewer, a Kanban badge click relays through the harness window's launcher
// tab — window.open is stubbed: the launcher handle "loads" its hook a moment after being
// navigated, and records what the dashboard asked; a second click on the same agent is a
// focus, never a reload; the Settings tab shows the viewer choice; and the launcher page itself
// renders from the same bundle at ?launcher=1 with the hook installed.
//
//   node client/tests/ui/shot-harness-window-tabs.mjs
// Output: docs/screenshots/manage-settings-tabs-viewer.png, harness-launcher.png

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const now = Date.now();
const H = 3600_000;
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [
  { machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 1, agents: [
    { handle: 'spacex/prg#1', key: 'self/r-prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/mirceta/prg.git', branch: 'master', defaultBranch: 'master', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't1' },
  ] },
  { machine: 'MONSTER', sourceId: 'src-monster', self: false, address: 'http://192.168.1.20:5099', reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 1, agents: [
    { handle: 'MONSTER/web-flow-autodev#1', key: 'src-monster/r-webflow', repoId: 'r-webflow', name: 'web-flow-autodev', remoteUrl: 'https://github.com/mirceta/web-flow-autodev.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'arch', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
  ] },
] };
const archState = { fleet: { selfLabel: 'spacex', sources: [], acceptSends: true, acceptUpgrades: false }, gateOpen: true, killSwitch: true, managed: ['r-prg'], managedFleet: [], repos: [{ id: 'r-prg', name: 'prg', path: 'C:/prg' }], home: { path: 'C:/arch-home', exists: true, commits: [] }, disallowedTools: [] };
const leg = (repoId, sourceId) => ({ repoId, sourceId, status: 'doing', assignedBy: 'arch', assignedAt: now - 2 * H, dispatchedAt: now - H, dispatchCount: 1, updatedAt: now - H });
const node = (id, title, repoId, sourceId) => ({ id, title, note: '', status: 'doing', repoId, sourceId, assignees: [leg(repoId, sourceId)], x: 0, y: 0, createdAt: 1, updatedAt: now - H, assignedBy: 'arch', assignedAt: now - 2 * H, dispatchedAt: now - H, dispatchCount: 1, createdBy: 'arch' });
const A = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', B = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5';
const board = { staleHours: 24, machines: [], scratch: '', goal: '', goalUpdatedAt: 0, edges: [], nodes: [node(A, 'Knjiga pošte orchestration', 'r-webflow', 'src-monster'), node(B, 'Invoice import', 'r-prg', null)], integrity: { checkedAt: now, cards: 2, honest: 2, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return archState;
    case '/api/arch/fleet/status': return fleet;
    case '/api/arch/conversations': return { conversations: [] };
    case '/api/arch/goals': return { goals: [] };
    case '/api/repos': return archState.repos;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.kanbanSub', 'board');
  localStorage.setItem('manageapp.harnessWindow', JSON.stringify({ mode: 'window', viewer: 'tabs', screen: null }));
  // The stub: per-name handles. The harness-window handle "loads" its launcher hook 120 ms
  // after being navigated to the launcher URL and records every ask; agent handles are never
  // created by the dashboard itself in this mode (the launcher would own them).
  window.__opens = []; window.__handles = {}; window.__asked = [];
  window.open = (url, name, features) => {
    window.__opens.push({ url, name, features });
    if (!window.__handles[name]) {
      const h = { name, focused: 0, closed: 0, focus() { this.focused++; }, close() { this.closed++; }, _href: 'about:blank' };
      Object.defineProperty(h, 'location', { get() { return { get href() { return h._href; }, set href(v) { h._href = v; if (name === 'birocode-harness-window') setTimeout(() => { h.__birocodeOpenAgent = (n, u) => { const seen = window.__asked.filter((a) => a[0] === n).length; window.__asked.push([n, u]); return seen ? 'focused' : 'opened'; }; }, 120); } }; } });
      window.__handles[name] = h;
    }
    return window.__handles[name];
  };
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const card = (id) => `[data-task="${id}"]`;

// 1. Settings: the viewer choice under window mode.
await page.goto(`${base}/manage.html?tab=settings&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-placement-viewer]', { timeout: 15000 });
const viewer = await page.$eval('[data-placement-viewer]', (e) => e.dataset.placementViewer);
const howto = await page.$eval('[data-placement-tabs-howto]', (e) => e.textContent);
await page.click('[data-placement-try]');
const tryOpen = await page.evaluate(() => ({ open: window.__opens.at(-1), href: window.__handles['birocode-harness-window']?._href }));
await shotMain('manage-settings-tabs-viewer.png');

// 2. Kanban: click agent A (first time) → the launcher tab is created without features and asked to open A;
//    click A again → the launcher is asked again and answers "focused", and the DASHBOARD raises
//    A's tab itself with window.open('', name) (openspec harness-window-reclick-raise) — the
//    stub hands it a blank handle, which counts as a stray and is closed, never navigated;
//    click B → a second ask. The launcher is looked up by name exactly ONCE (handle kept).
await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card(A)} [data-open-worker]`, { timeout: 15000 });
await page.click(`${card(A)} [data-open-worker]`);
await page.waitForFunction(() => window.__asked.length === 1, null, { timeout: 8000 });
const first = await page.evaluate(() => ({ opens: window.__opens, asked: window.__asked, launcherHref: window.__handles['birocode-harness-window']._href }));
await page.click(`${card(A)} [data-open-worker]`);
await page.waitForFunction(() => window.__asked.length === 2, null, { timeout: 8000 });
await page.click(`${card(B)} [data-open-worker]`);
await page.waitForFunction(() => window.__asked.length === 3, null, { timeout: 8000 });
const after = await page.evaluate(() => ({ opens: window.__opens, asked: window.__asked, handles: Object.keys(window.__handles), agentA: (() => { const h = window.__handles['birocode-agent-src-monster_r-webflow']; return h ? { href: h._href, closed: h.closed, focused: h.focused } : null; })() }));

// 3. The launcher page itself, from the same bundle.
await page.goto(`${base}/manage.html?launcher=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-harness-launcher]', { timeout: 15000 });
const hookInstalled = await page.evaluate(() => typeof window.__birocodeOpenAgent === 'function');
const launcherEmpty = !!(await page.$('[data-launcher-empty]'));
// Drive the hook as the dashboard would: the first call opens (stub handle), the second focuses; the list updates.
const hookResults = await page.evaluate(() => [window.__birocodeOpenAgent('birocode-agent-x', 'http://192.168.1.20:5099/studio?agent=x'), window.__birocodeOpenAgent('birocode-agent-x', 'http://192.168.1.20:5099/studio?agent=x')]);
await page.waitForSelector('[data-launcher-agent="birocode-agent-x"]', { timeout: 5000 });
const listed = await page.$eval('[data-launcher-agent="birocode-agent-x"]', (e) => e.textContent);
await shotMain('harness-launcher.png');
await browser.close();
await server.close();

const launcherOpens = first.opens.filter((o) => o.name === 'birocode-harness-window');
const result = {
  viewerChoiceShown: viewer === 'tabs' && /allow pop-ups/.test(howto),
  openNowCreatesTheLauncherTab: tryOpen.open?.name === 'birocode-harness-window' && tryOpen.open?.features === undefined && /\?launcher=1$/.test(tryOpen.href || ''),
  firstClickCreatesLauncherWithoutFeaturesAndAsksIt: launcherOpens.length >= 1 && launcherOpens.every((o) => o.features === undefined) && /manage\.html\?launcher=1$/.test(first.launcherHref) && first.asked[0]?.[0] === 'birocode-agent-src-monster_r-webflow' && /192\.168\.1\.20:5099\/studio\?agent=r-webflow/.test(first.asked[0]?.[1] || ''),
  reclickAsksAgainAndIsAFocusNotAReload: after.asked.length === 3 && after.asked[1][0] === after.asked[0][0],
  secondAgentGetsItsOwnAsk: after.asked[2][0] === 'birocode-agent-_r-prg',
  launcherLookedUpOnce: after.opens.filter((o) => o.name === 'birocode-harness-window').length === 1,
  reclickRaisesAgentTabFromTheDashboard: (() => { const o = after.opens.filter((x) => x.name === 'birocode-agent-src-monster_r-webflow'); return o.length === 1 && o[0].url === '' && o[0].features === undefined && after.agentA?.href === 'about:blank' && after.agentA?.closed === 1 && after.agentA?.focused === 0; })(),
  dashboardOpensNoOtherAgentTab: after.handles.every((n) => n === 'birocode-harness-window' || n === 'birocode-agent-src-monster_r-webflow'),
  launcherPageRendersWithHook: hookInstalled && launcherEmpty && hookResults[0] === 'opened' && hookResults[1] === 'focused' && /2× focused/.test(listed),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ viewer, tryOpen, first, after, hookResults, listed, pageErrors: errs, result, out: ['manage-settings-tabs-viewer.png', 'harness-launcher.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
