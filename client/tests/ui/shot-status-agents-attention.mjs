// Evidence shot for fleet task 4a1fb7ee (openspec status-agents-attention): Management → Status →
// Agents over a mocked fleet. (1) the split / merged switch: two sections per machine vs one
// list with an occupancy marker on each row, remembered across a reload; (2) "finished, not yet
// checked": an agent that is running on the first poll finishes on the next (the mock flips
// runningSince → null, unseenResult → true) — it STAYS in the running view with a "!",
// expanding its details does NOT clear it, the dedicated ✓ "mark as checked" posts to
// /api/arch/fleet/checked and the agent leaves the running view. Three screenshots.
//
//   node client/tests/ui/shot-status-agents-attention.mjs
// Output: docs/screenshots/status-agents-split.png, status-agents-merged.png, status-agents-running.png, status-agents-finished.png, status-agents-checked.png

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
const agent = (self, sourceId, repoId, name, label, o = {}) => ({
  handle: `${label}/${name}#1`, key: self ? repoId : `${sourceId}/${repoId}`, repoId, name, remoteUrl: `https://github.com/mirceta/${name}.git`,
  branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, unseenResult: false,
  managed: true, docked: true, exists: true, tabId: self ? `t-${repoId}` : null, occupancy: { occupied: false, source: 'branch' }, ...o,
});
const occupied = { branch: 'feature/x', onDefault: false, availability: 'claimed', occupancy: { occupied: true, source: 'branch' } };
let phase = 'running';
const calls = [];
const spacexAgents = () => [
  agent(true, 'self', 'r-prg', 'prg', 'spacex', phase === 'running' ? { runningSince: now - 90_000, ...occupied } : phase === 'finished' ? { unseenResult: true, ...occupied } : occupied),
  agent(true, 'self', 'r-web', 'web', 'spacex', occupied),
  agent(true, 'self', 'r-docs', 'docs', 'spacex'),
  agent(true, 'self', 'r-api', 'api', 'spacex', { occupancy: { occupied: true, source: 'operator', setAt: now - 3600_000 }, availability: 'claimed' }),
];
const monsterAgents = () => [
  agent(false, 'src-monster', 'r-webflow', 'web-flow-autodev', 'MONSTER', { unseenResult: true, ...occupied }),   // finished while the Operator was away
  agent(false, 'src-monster', 'r-shop', 'shop', 'MONSTER'),
];
const fleet = () => ({ at: Date.now(), hubVersion: '1.0.0+test', machines: [
  { machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 4, agents: spacexAgents() },
  { machine: 'MONSTER', sourceId: 'src-monster', self: false, address: 'http://192.168.1.20:5099', reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 2, agents: monsterAgents() },
] });
function mock(method, pathname, body) {
  if (pathname === '/api/arch/fleet/checked' && method === 'POST') {
    const b = JSON.parse(body || '{}');
    calls.push(`${b.sourceId || 'self'}:${b.repoId}`);
    if (b.repoId === 'r-prg') phase = 'checked';
    return { ok: true, status: 'cleared', detail: `${b.repoId} marked checked`, fleet: fleet() };
  }
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet();
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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(route.request().method(), pathname, route.request().postData())) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const readState = () => page.evaluate(() => ({
  layout: document.querySelector('[data-layout-switch]')?.dataset.layout,
  sections: [...document.querySelectorAll('[data-occ-section]')].map((s) => `${s.dataset.occSection}:${s.dataset.occCount}`),
  merged: [...document.querySelectorAll('[data-occupancy-merged]')].map((s) => s.dataset.occCount),
  markers: [...document.querySelectorAll('[data-occupancy-merged] [data-occ-marker]')].map((m) => m.dataset.occMarker),
  chips: [...document.querySelectorAll('[data-agent]')].map((c) => ({ key: c.dataset.agent, running: c.dataset.running, finished: c.dataset.finishedUnchecked || null, text: c.textContent })),
  runningCount: document.querySelector('[data-filter="running"] .fs__count')?.textContent,
  filter: document.querySelector('.fs__filter--on[data-filter]')?.dataset.filter,
  checkButtons: [...document.querySelectorAll('[data-mark-checked]')].map((b) => b.dataset.markChecked),
  detailOpen: [...document.querySelectorAll('[data-detail]')].map((d) => d.dataset.detail),
  detailFinished: [...document.querySelectorAll('[data-detail-finished]')].map((d) => d.dataset.detailFinished),
  shown: document.querySelector('[data-shown]')?.dataset.shown,
}));

await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent="r-prg"]', { timeout: 60000 });

// ---- 1. split (default) vs merged, remembered across a reload --------------------------------
const split = await readState();
await shotMain('status-agents-split.png');
await page.click('[data-layout-set="merged"]');
await page.waitForSelector('[data-occupancy-merged]', { timeout: 10000 });
const merged = await readState();
await shotMain('status-agents-merged.png');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent="r-prg"]', { timeout: 60000 });
const afterReload = await readState();

// ---- 2. the text filter still works in merged mode ---------------------------------------------
await page.fill('[data-search]', 'web');
await page.waitForFunction(() => document.querySelectorAll('[data-agent]').length === 2, null, { timeout: 10000 });
const searched = await readState();
await page.fill('[data-search]', '');
await page.waitForFunction(() => document.querySelectorAll('[data-agent]').length === 6, null, { timeout: 10000 });

// ---- 3. running → finished with the "!" → details do not clear → ✓ clears -----------------------
await page.click('[data-filter="running"]');
await page.waitForFunction(() => [...document.querySelectorAll('[data-agent]')].map((c) => c.dataset.agent).join(',') === 'r-prg,src-monster/r-webflow', null, { timeout: 10000 });
const runningView = await readState();
await shotMain('status-agents-running.png');
phase = 'finished';                                            // the turn ends between two polls
await page.waitForSelector('[data-agent="r-prg"][data-finished-unchecked="true"]', { timeout: 15000 });
const finishedView = await readState();
await page.click('[data-agent="r-prg"]');                      // expanding = viewing, not acknowledging
await page.waitForSelector('[data-detail="r-prg"]', { timeout: 10000 });
await page.waitForTimeout(5500);                               // another poll passes with the details open
const afterExpand = await readState();
const callsAtExpand = calls.length;
await shotMain('status-agents-finished.png');
await page.click('[data-detail-finished="r-prg"] [data-mark-checked="r-prg"]');   // the dedicated button
await page.waitForFunction(() => !document.querySelector('[data-agent="r-prg"]'), null, { timeout: 15000 });
const afterCheck = await readState();
await page.click('[data-filter="all"]');
await page.waitForSelector('[data-agent="r-prg"]', { timeout: 10000 });
const allAfter = await readState();
await page.click('[data-filter="running"]');
await page.waitForFunction(() => document.querySelectorAll('[data-agent]').length === 1, null, { timeout: 10000 });
await shotMain('status-agents-checked.png');
await browser.close();
await server.close();

const prgBefore = finishedView.chips.find((c) => c.key === 'r-prg');
const prgExpanded = afterExpand.chips.find((c) => c.key === 'r-prg');
const prgAll = allAfter.chips.find((c) => c.key === 'r-prg');
const result = {
  splitIsTwoSectionsPerMachine: split.layout === 'split' && split.sections.join(',') === 'occupied:3,free:1,occupied:1,free:1' && split.merged.length === 0,
  mergedIsOneListWithMarkersOccupiedFirst: merged.layout === 'merged' && merged.sections.length === 0 && merged.merged.join(',') === '4,2' && merged.markers.join(',') === 'occupied,occupied,occupied,free,occupied,free',
  layoutRememberedAcrossReload: afterReload.layout === 'merged' && afterReload.merged.length === 2,
  textFilterWorksInMerged: searched.chips.map((c) => c.key).join(',') === 'r-web,src-monster/r-webflow' && searched.merged.join(',') === '1,1',
  runningViewShowsRunningAndFinished: runningView.filter === 'running' && runningView.chips.map((c) => c.key).join(',') === 'r-prg,src-monster/r-webflow' && runningView.runningCount === '2',
  finishedStaysInRunningViewWithBang: !!prgBefore && prgBefore.running === 'false' && prgBefore.finished === 'true' && /!/.test(prgBefore.text) && /finished/.test(prgBefore.text) && finishedView.checkButtons.includes('r-prg'),
  expandingDoesNotClear: afterExpand.detailOpen.includes('r-prg') && afterExpand.detailFinished.includes('r-prg') && prgExpanded?.finished === 'true' && callsAtExpand === 0,
  dedicatedButtonClearsAndLeavesRunningView: calls.join(',') === 'self:r-prg' && !afterCheck.chips.some((c) => c.key === 'r-prg') && afterCheck.chips.map((c) => c.key).join(',') === 'src-monster/r-webflow',
  normalAgentAgain: !!prgAll && prgAll.finished === null && prgAll.running === 'false' && !/!/.test(prgAll.text),
  peerFinishedMarkedToo: finishedView.chips.find((c) => c.key === 'src-monster/r-webflow')?.finished === 'true',
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ split, merged, afterReload, searched, runningView, finishedView, afterExpand, afterCheck, allAfter, calls, pageErrors: errs, result, out: ['status-agents-split.png', 'status-agents-merged.png', 'status-agents-running.png', 'status-agents-finished.png', 'status-agents-checked.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
