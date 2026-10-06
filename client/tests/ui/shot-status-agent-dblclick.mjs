// Evidence for fleet task 6f86332c (openspec status-agent-dblclick): Management → Status →
// Agents, DOUBLE-CLICK on a repo agent chip opens its harness directly — the SAME
// focusAgentTab call as the details' big "Open harness" button (one named tab per agent,
// focus without reload), not a second implementation. Asserted:
//   1. dblclick with the details CLOSED → the agent's named tab opens at the machine's
//      studio deep link and is focused; the details end CLOSED (the double-click's two
//      clicks toggle them open and shut — nothing left toggled);
//   2. a second dblclick finds the existing tab and focuses it WITHOUT reloading;
//   3. a single click still expands the details; dblclick with the details OPEN leaves
//      them open;
//   4. the chip's tooltip carries the "double-click: open harness" hint;
//   5. MERGED layout: the same dblclick works;
//   6. an agent on a machine with no known address has no dblclick action and nothing opens;
//   7. the ✓ "mark as checked" beside a finished chip still works on its own — clicking it
//      opens no harness and does not toggle the details.
//
//   node tests/ui/shot-status-agent-dblclick.mjs
// Output: docs/screenshots/status-agent-dblclick.png (split strip, details closed, after the
// dblclick opened the tab) and status-agent-dblclick-merged.png.

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
  { machine: 'MONSTER', sourceId: 'src-monster', self: false, address: 'http://192.168.1.20:5099', reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 2, agents: [
    agent(false, 'src-monster', 'r-webflow', 'web-flow-autodev', 'MONSTER', { branch: 'feat/exporter', onDefault: false }),
    agent(false, 'src-monster', 'r-done', 'done-agent', 'MONSTER', { unseenResult: true }),
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
    case '/api/arch/fleet/checked': return { ok: true };
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

async function open(layout) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((lay) => {
    localStorage.setItem('manageapp.layout', 'tabs');
    localStorage.setItem('manageapp.hidden', '[]');
    localStorage.setItem('claudeweb_ui_mode', 'advanced');
    localStorage.removeItem('manageapp.fleetFilters');
    localStorage.setItem('manageapp.fleetAgentsLayout', lay);
    window.__opens = []; window.__posts = []; window.__handles = {};
    window.open = (url, name) => {
      window.__opens.push({ url, name });
      if (!window.__handles[name]) window.__handles[name] = { name, _href: 'about:blank', focused: 0, focus() { this.focused++; }, get location() { const h = this; return { get href() { return h._href; }, set href(v) { h._href = v; } }; } };
      return window.__handles[name];
    };
  }, layout);
  await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === 'POST') { /* record through the page instead */ }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-agent="src-monster/r-webflow"]', { timeout: 60000 });
  return { ctx, page, errs };
}

const CHIP = '[data-agent="src-monster/r-webflow"]';
const snap = (page) => page.evaluate(() => ({
  opens: window.__opens.slice(),
  handle: window.__handles['birocode-agent-src-monster_r-webflow'] ? { href: window.__handles['birocode-agent-src-monster_r-webflow']._href, focused: window.__handles['birocode-agent-src-monster_r-webflow'].focused } : null,
  detailOpen: !!document.querySelector('[data-detail="src-monster/r-webflow"]'),
  hint: (document.querySelector('[data-agent="src-monster/r-webflow"]')?.title || '').includes('double-click: open harness'),
  dblAttr: document.querySelector('[data-agent="src-monster/r-webflow"]')?.dataset.dblclickHarness || null,
  laptopDbl: document.querySelector('[data-agent="src-laptop/r-x"]')?.dataset.dblclickHarness || null,
}));

// ---- split layout -----------------------------------------------------------------------------
const split = await open('split');
const s0 = await snap(split.page);
await split.page.dblclick(CHIP);
const s1 = await snap(split.page);
await (await split.page.$('.fs')).screenshot({ path: path.join(OUT, 'status-agent-dblclick.png') });
await split.page.dblclick(CHIP);                        // find + focus, never reload
const s2 = await snap(split.page);
await split.page.click(CHIP);                            // single click still expands
const s3 = await snap(split.page);
await split.page.dblclick(CHIP);                         // dblclick with details open leaves them open
const s4 = await snap(split.page);
// the ✓ beside the finished chip: its own action, no harness, no toggle
await split.page.click('[data-mark-checked="src-monster/r-done"]');
const s5 = await snap(split.page);
const laptopOpensBefore = s5.opens.length;
await split.page.dblclick('[data-agent="src-laptop/r-x"]'); // no address → nothing opens
const s6 = await snap(split.page);
const splitErrs = split.errs;
await split.ctx.close();

// ---- merged layout ----------------------------------------------------------------------------
const merged = await open('merged');
await merged.page.waitForSelector('[data-occupancy-merged]', { timeout: 10000 });
await merged.page.dblclick(CHIP);
const m1 = await snap(merged.page);
await (await merged.page.$('.fs')).screenshot({ path: path.join(OUT, 'status-agent-dblclick-merged.png') });
const mergedErrs = merged.errs;
await merged.ctx.close();

await browser.close();
await server.close();

const STUDIO = 'http://192.168.1.20:5099/studio?agent=r-webflow';
const result = {
  hintOnTheChip: s0.hint && s0.dblAttr === 'src-monster|r-webflow',
  dblclickOpensTheBadgesTab: s1.opens.length === 1 && s1.opens[0].name === 'birocode-agent-src-monster_r-webflow' && s1.opens[0].url === '' && s1.handle?.href === STUDIO && s1.handle.focused === 1,
  detailsEndClosedNotToggled: s0.detailOpen === false && s1.detailOpen === false,
  secondDblclickFocusesWithoutReload: s2.opens.length === 2 && s2.handle.href === STUDIO && s2.handle.focused === 2,
  singleClickStillExpands: s3.detailOpen === true,
  dblclickWithDetailsOpenLeavesThemOpen: s4.detailOpen === true && s4.opens.length === 3,
  markCheckedStaysIndependent: s5.opens.length === 3 && s5.detailOpen === s4.detailOpen,
  unknownAddressDoesNothing: s0.laptopDbl === null && s6.opens.length === laptopOpensBefore,
  mergedLayoutWorksToo: m1.opens.length === 1 && m1.opens[0].name === 'birocode-agent-src-monster_r-webflow' && m1.handle?.href === STUDIO && m1.detailOpen === false,
  noPageErrors: splitErrs.length === 0 && mergedErrs.length === 0,
};
console.log(JSON.stringify({ s0, s1, s2, s3, s4, s5, s6, m1, result }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
