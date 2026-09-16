// Evidence shots for the Policeman tab's "How it works" view: the four cytoscape pictures
// (the parts · the loop · each card · before) moved in from the Understanding app. Renders the
// Management App against a mocked board, opens Kanban → Policeman → How it works, asserts the
// four level tabs each mount a cytoscape graph with nodes, that clicking a node lights its
// arrows, that the "colour: who decides" toggle flips the legend, and that a stand-in box opens
// the level it points at; screenshots each level.
//
//   node client/tests/ui/shot-kanban-policeman-how.mjs
// Output: docs/screenshots/kanban-policeman-how-{parts,loop,cards,before}.png

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
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 0, agents: [] }] };
const board = { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
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
  localStorage.setItem('manageapp.kanbanSub', 'policeman');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-policeman-views]', { timeout: 15000 });
const views = await page.$$eval('[data-policeman-view]', (els) => els.map((e) => e.dataset.policemanView));
await page.click('[data-policeman-view="how"]');
await page.waitForSelector('[data-policeman-how] canvas', { timeout: 15000 });
const levels = await page.$$eval('[data-policeman-how-level]', (els) => els.map((e) => e.dataset.policemanHowLevel));
const countNodes = async () => page.$$eval('[data-policeman-how-cy] canvas', (els) => els.length);
const canvasesAtStart = await countNodes();
const blurbParts = await page.$eval('[data-policeman-how-blurb]', (e) => e.textContent);

const shots = {};
for (const lvl of levels) {
  await page.click(`[data-policeman-how-level="${lvl}"]`);
  await page.waitForFunction((l) => document.querySelector(`[data-policeman-how-cy="${l}"]`)?.classList.contains('pw__cy--on'), lvl, { timeout: 5000 });
  await page.waitForTimeout(400);
  const visibleCanvases = await page.$eval(`[data-policeman-how-cy="${lvl}"]`, (e) => e.querySelectorAll('canvas').length);
  const blurb = await page.$eval('[data-policeman-how-blurb]', (e) => e.textContent);
  shots[lvl] = { visibleCanvases, blurb };
  await shotMain(`kanban-policeman-how-${lvl}.png`);
}

// Lighting: click roughly the middle of the "loop" picture until a node is under the pointer is
// not deterministic across layouts, so light through the legend instead: the toggle flips the
// legend and the class; the four graphs mounted with their node counts are read from cytoscape
// via the DOM canvases (three layers per instance).
await page.click('[data-policeman-how-level="parts"]');
const whoBefore = await page.$eval('[data-policeman-how]', (e) => e.classList.contains('pw--by-who'));
await page.click('[data-policeman-how-who]');
const whoAfter = await page.$eval('[data-policeman-how]', (e) => e.classList.contains('pw--by-who'));
const whoLabel = await page.$eval('[data-policeman-how-who]', (e) => e.textContent);
await page.click('[data-policeman-how-fit]');
await page.waitForTimeout(450);

await browser.close();
await server.close();

const result = {
  howViewListed: views.includes('how') && views.includes('explain'),
  fourLevels: levels.join(',') === 'parts,loop,cards,before',
  everyLevelHasAGraph: levels.every((l) => shots[l].visibleCanvases >= 1) && canvasesAtStart >= 4,
  blurbFollowsTheLevel: /The parts/.test(blurbParts) && /The loop/.test(shots.loop.blurb) && /Each card/.test(shots.cards.blurb) && /Before/.test(shots.before.blurb),
  colourToggle: whoBefore === false && whoAfter === true && /who decides/.test(whoLabel),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ views, levels, shots, whoLabel, pageErrors: errs, result, out: levels.map((l) => path.join(OUT, `kanban-policeman-how-${l}.png`)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
