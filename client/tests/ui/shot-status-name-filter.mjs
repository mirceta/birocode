// Evidence shots for fleet task 9be69c00 (openspec status-filter-agent-name): Management →
// Status, the as-you-type agent text filter. Three scenes:
//   1. nothing typed — every agent shows (status-name-filter-before.png);
//   2. the label printed ON the chip ("autodev#1") typed — exactly that agent stays, the
//      other machines collapse to their headers (status-name-filter-typed.png); this exact
//      query matched NOTHING before the fix (the old haystack had only repo name / branch /
//      URL / machine, never the handle-derived chip label);
//   3. the textbox COMPOSED with a state button — query "spacex" + the "occupied" chip
//      keep only the occupied spacex agent (status-name-filter-compose.png).
// Plus: junk shows the no-match note, and × clear restores everything.
//
//   node client/tests/ui/shot-status-name-filter.mjs
// Output: docs/screenshots/status-name-filter-{before,typed,compose}.png

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
const agent = (self, sourceId, repoId, name, label, extra = {}) => ({
  handle: `${label}/${name}#1`, key: self ? repoId : `${sourceId}/${repoId}`, repoId, name, remoteUrl: `https://github.com/mirceta/${name}.git`,
  branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null,
  managed: true, docked: true, exists: true, tabId: self ? 't1' : null, occupancy: { occupied: false, source: 'auto' }, ...extra,
});
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [
  { machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2, agents: [
    agent(true, 'self', 'r-prg', 'prg', 'spacex'),
    agent(true, 'self', 'r-exp', 'exporter', 'spacex', { branch: 'feat/csv', onDefault: false, occupancy: { occupied: true, source: 'operator' } }),
  ] },
  { machine: 'MONSTER', sourceId: 'src-monster', self: false, address: 'http://192.168.1.20:5099', reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 1, agents: [
    agent(false, 'src-monster', 'r-webflow', 'web-flow-autodev', 'MONSTER'),
  ] },
  { machine: 'laptop', sourceId: 'src-laptop', self: false, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: false, acceptsUpgrades: false, gateOpen: false, allowSends: false, managedCount: 1, agents: [
    agent(false, 'src-laptop', 'r-x', 'x', 'laptop'),
  ] },
] };
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
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
  localStorage.removeItem('manageapp.fleetFilters'); // a clean filter state per run
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const state = () => page.evaluate(() => ({
  shown: Number(document.querySelector('[data-shown]')?.dataset.shown),
  total: Number(document.querySelector('[data-shown]')?.dataset.total),
  chips: [...document.querySelectorAll('[data-agent]')].map((b) => b.dataset.agent),
  collapsed: [...document.querySelectorAll('[data-machine][data-collapsed]')].map((s) => s.dataset.machine),
  noMatch: !!document.querySelector('[data-no-match]'),
}));

await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent]', { timeout: 60000 });

// 1. Nothing typed: all four agents, no machine collapsed.
const before = await state();
await shotMain('status-name-filter-before.png');

// 2. Type the label the chip itself shows. Keystroke by keystroke — the list narrows live.
const box = page.locator('[data-search]');
await box.pressSequentially('autodev#1', { delay: 20 });
await page.waitForFunction(() => document.querySelector('[data-shown]')?.dataset.shown === '1', null, { timeout: 10000 });
const typed = await state();
await shotMain('status-name-filter-typed.png');

// 3. Junk: the honest no-match note.
await box.fill('no-such-agent');
await page.waitForSelector('[data-no-match]', { timeout: 10000 });
const junk = await state();

// 4. Compose with a button filter: query narrows to one machine, the occupied chip narrows further.
await box.fill('spacex');
await page.waitForFunction(() => document.querySelector('[data-shown]')?.dataset.shown === '2', null, { timeout: 10000 });
const queried = await state();
await page.click('[data-filter="occupied"]');
await page.waitForFunction(() => document.querySelector('[data-shown]')?.dataset.shown === '1', null, { timeout: 10000 });
const composed = await state();
await shotMain('status-name-filter-compose.png');

// 5. × clear: everything back.
await page.click('[data-clear-filters]');
await page.waitForFunction(() => document.querySelector('[data-shown]')?.dataset.shown === '4', null, { timeout: 10000 });
const cleared = await state();

await browser.close();
await server.close();

const result = {
  allFourShowBeforeTyping: before.shown === 4 && before.total === 4 && before.chips.length === 4 && before.collapsed.length === 0,
  typingTheChipLabelKeepsExactlyThatAgent: typed.shown === 1 && typed.chips.join() === 'src-monster/r-webflow' && typed.collapsed.includes('spacex') && typed.collapsed.includes('laptop'),
  junkShowsTheNoMatchNote: junk.shown === 0 && junk.noMatch,
  textboxComposesWithTheOccupiedButton: queried.shown === 2 && composed.shown === 1 && composed.chips.join() === 'r-exp',
  clearRestoresEverything: cleared.shown === 4 && !cleared.noMatch,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ before, typed, junk, queried, composed, cleared, pageErrors: errs, result, out: OUT }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
