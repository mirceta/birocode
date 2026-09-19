// Evidence shots for openspec management-settings-tab (fleet task a434653b): the Management
// App against a MOCKED fleet — the new Settings tab carries the Managed-agents scope and the
// Fleet posture (moved out of Status) plus the "where badge links open" setting; the Status
// tab keeps the Home repo and goal conversations; and the placement actually changes what a
// Kanban badge click does: window.open is stubbed to record (url, name, features) — "tabs"
// opens the per-agent named tab with no features, "window" opens the ONE dedicated harness
// window with the chosen screen's left/top/width/height and navigates it to the agent's
// deep link.
//
//   node client/tests/ui/shot-manage-settings.mjs
// Output: docs/screenshots/manage-settings.png, manage-status-after.png

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
const archState = {
  fleet: { selfLabel: 'spacex', sources: [{ id: 'src-monster', label: 'MONSTER', allowSends: true, peer: { status: 'ok', behind: false, acceptsUpgrades: true } }], acceptSends: true, acceptUpgrades: false },
  gateOpen: true, killSwitch: true, managed: ['r-prg'], managedFleet: [], repos: [{ id: 'r-prg', name: 'prg', path: 'C:/prg' }],
  home: { path: 'C:/playground/arch-home', exists: true, commits: [{ sha: 'abc1234', subject: 'memory: fleet', at: now - 2 * H }] }, disallowedTools: ['Edit', 'Write'],
};
const node = { id: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', title: 'Knjiga pošte orchestration', note: '', status: 'doing', repoId: 'r-webflow', sourceId: 'src-monster', assignees: [{ repoId: 'r-webflow', sourceId: 'src-monster', status: 'doing', assignedBy: 'arch', assignedAt: now - 2 * H, dispatchedAt: now - H, dispatchCount: 1, updatedAt: now - H }], x: 0, y: 0, createdAt: 1, updatedAt: now - H, assignedBy: 'arch', assignedAt: now - 2 * H, dispatchedAt: now - H, dispatchCount: 1, createdBy: 'arch' };
const board = { staleHours: 24, machines: [], scratch: '', goal: '', goalUpdatedAt: 0, edges: [], nodes: [node], integrity: { checkedAt: now, cards: 1, honest: 1, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
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
  // Record every window.open instead of opening anything.
  window.__opens = [];
  window.open = (url, name, features) => { window.__opens.push({ url, name, features }); const h = { location: { href: 'about:blank' }, focus() { h.focused = true; } }; window.__last = h; return h; };
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const text = async (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);

// 1. The Settings tab: the placement setting + Managed agents + Fleet; no Home repo here.
await page.goto(`${base}/manage.html?tab=settings&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-settings-pane] [data-arch-cards] .arch__card', { timeout: 15000 });
const tabs = await page.$$eval('[data-tab]', (els) => els.map((e) => e.dataset.tab));
const settingsCards = await page.$$eval('[data-settings-arch] .arch__card-head', (els) => els.map((e) => e.textContent.trim()));
const settingsPane = await text('[data-settings-pane]');
const modeDefault = await page.$eval('[data-placement-mode="tabs"] input', (e) => e.checked);
await shotMain('manage-settings.png');

// 2. Choose the dedicated window and a screen (the picker itself needs Chrome's Window
//    Management API on a secure page; the stored choice is what the badge click reads).
await page.click('[data-placement-mode="window"] input');
await page.waitForSelector('[data-placement-screens]', { timeout: 5000 });
const unavailableNote = await text('[data-placement-unavailable]');
// On 127.0.0.1 (a secure context) with Chrome the picker IS available; on the Operator's
// http LAN address it is not and the honest note shows instead — exactly one of the two.
const detectShown = !!(await page.$('[data-placement-detect]'));
await page.evaluate(() => localStorage.setItem('manageapp.harnessWindow', JSON.stringify({ mode: 'window', screen: { label: 'DELL U2419H', left: -1920, top: 0, width: 1920, height: 1080, availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1040 } })));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-placement-screen-chosen]', { timeout: 15000 });
const chosen = await text('[data-placement-screen-chosen]');
await page.click('[data-placement-try]');
const tryOpen = await page.evaluate(() => window.__opens.at(-1));
const tryNav = await page.evaluate(() => window.__last?.location?.href);

// 3. The Status tab keeps Home repo + goal conversations, and no longer the settings cards.
await page.goto(`${base}/manage.html?tab=status&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-status-pane] [data-arch-cards] .arch__card', { timeout: 15000 });
const statusCards = await page.$$eval('[data-status-pane] .mg__status-arch .arch__card-head', (els) => els.map((e) => e.textContent.trim()));
await shotMain('manage-status-after.png');

// 4. A Kanban badge click in "window" mode opens the ONE dedicated window with the screen's features.
await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-open-worker]', { timeout: 15000 });
await page.evaluate(() => { window.__opens = []; });
await page.click('[data-open-worker]');
const windowOpen = await page.evaluate(() => ({ open: window.__opens.at(-1), nav: window.__last?.location?.href, focused: !!window.__last?.focused }));
// …and in "tabs" mode the per-agent named tab, with no features (today's behaviour).
await page.evaluate(() => { localStorage.setItem('manageapp.harnessWindow', JSON.stringify({ mode: 'tabs', screen: null })); window.__opens = []; });
await page.click('[data-open-worker]');
const tabOpen = await page.evaluate(() => window.__opens.at(-1));
await browser.close();
await server.close();

const result = {
  settingsTabListed: tabs.includes('settings') && tabs.includes('status'),
  settingsHoldsScopeAndFleet: settingsCards.some((h) => /Managed agents/.test(h)) && settingsCards.some((h) => /^Fleet/.test(h)) && !settingsCards.some((h) => /Home repo|Goal conversations/.test(h)),
  placementShown: /Where the Kanban badge links open/.test(settingsPane) && modeDefault === true,
  pickerOrHonestNote: detectShown ? unavailableNote === null : (/Screen picking is not available here/.test(unavailableNote || '') && /secure page/.test(unavailableNote || '')),
  chosenScreenShown: /DELL U2419H · 1920×1080 at \(-1920, 0\)/.test(chosen || ''),
  tryOpenPlacesTheWindow: tryOpen?.name === 'birocode-harness-window' && tryOpen?.features === 'popup=1,left=-1920,top=0,width=1920,height=1040' && /\/studio$/.test(tryNav || ''),
  statusKeepsHomeAndGoals: statusCards.some((h) => /Home repo/.test(h)) && statusCards.some((h) => /Goal conversations/.test(h)) && !statusCards.some((h) => /Managed agents|^Fleet/.test(h)),
  badgeClickUsesTheWindow: windowOpen.open?.name === 'birocode-harness-window' && /left=-1920/.test(windowOpen.open?.features || '') && /192\.168\.1\.20:5099\/studio\?agent=r-webflow/.test(windowOpen.nav || '') && windowOpen.focused,
  badgeClickInTabsMode: tabOpen?.name === 'birocode-agent-src-monster_r-webflow' && tabOpen?.features === undefined,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ tabs, detectShown, settingsCards, statusCards, chosen, tryOpen, tryNav, windowOpen, tabOpen, unavailableNote, pageErrors: errs, result, out: ['manage-settings.png', 'manage-status-after.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
