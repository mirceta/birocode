// Evidence for fleet task 40b3e438 (openspec fleet-status-compact-layout): Management → Status
// → Agents on a NINE-machine fleet — compact rows, a per-machine facts table instead of the
// badge soup, orderly agent chips (running first, bigger; idle after, one column grid) and a
// PINNED head (title + view tabs + filter bar) that stays while the machine list scrolls.
//
// The fixture is nine machines shaped like the real fleet (this machine's own six repo agents
// as the hub reports them, credentials scrubbed; eight peers with the same field set — one
// unreachable, one on an older build, running / finished-unchecked / occupied / free mixed).
// The dashboard's own API is behind the Operator's password, so the shots come from the real
// Management App bundle served by Vite against this fixture, at ONE viewport for before/after.
//
//   SHOT_NAME=before SHOT_ASSERT=0 node tests/ui/shot-fleet-status-compact.mjs   (main's code)
//   node tests/ui/shot-fleet-status-compact.mjs                                   (after; asserts)
// Output: docs/screenshots/fleet-status-compact-<name>-top.png (viewport, page top),
//         -scrolled.png (viewport, scrolled ~900 px: the pinned head over the list),
//         -merged.png (merged layout, page top), -full.png (the whole tab), -narrow.png (a 760 px
//         pane), -dark.png (the dark scheme).
// With SHOT_ASSERT=1 it asserts: nothing overflows horizontally; the head is still at the top of
// the pane after scrolling (sticky), with a solid background; every machine has the SAME facts
// columns in the same order; a running chip is wider than an idle chip; running chips come first
// in every section; filters, split/merged, the "!" + ✓, click-to-expand, double-click-to-open
// and the occupancy toggle still work.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const name = process.env.SHOT_NAME || 'after';
const assertNow = (process.env.SHOT_ASSERT ?? '1') !== '0';

const now = Date.now();
const HUB = '1.0.0+658b5884c0fd71b69b42c64151ab6769b4192e03';
const OLD = '1.0.0+553fb73e642d6220e9c70e4ea483403067cf85d9';
const occ = (occupied, source = 'branch') => ({ occupied, source });
const agent = (m, repoId, name, extra = {}) => {
  const branch = extra.branch ?? 'main';
  const onDefault = extra.onDefault ?? (branch === 'main' || branch === 'master');
  return {
    handle: name, key: m.self ? repoId : `${m.sourceId}/${repoId}`, repoId, name, remoteUrl: extra.remoteUrl ?? `https://github.com/mirceta/${name}.git`,
    branch, defaultBranch: branch === 'master' ? 'master' : 'main', onDefault, dirty: false, availability: onDefault ? 'available' : 'claimed', lastActor: 'human', runningSince: null,
    managed: true, docked: true, exists: true, tabId: m.self ? `t-${repoId}` : null, occupancy: occ(!onDefault), ...extra,
  };
};
const machine = (label, sourceId, extra = {}) => ({
  machine: label, sourceId, self: false, address: `http://192.168.1.${20 + (sourceId.length % 60)}:5099`, reachable: true, status: 'ok', detail: null, version: HUB, behind: false,
  acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 0, overview: null, staleTasks: [], agents: [], ...extra,
});

// This machine, as the hub reports its six repo agents (fleet view of 2026-10-07, credentials scrubbed).
const self = machine('SPACEX4', 'self', { self: true, address: null, acceptsUpgrades: false, allowSends: true });
self.agents = [
  agent(self, 'r-cw', 'claude-web-this-app', { remoteUrl: 'https://github.com/mirceta/birocode.git', branch: 'feat/fleet-status-compact-layout', lastActor: 'arch', runningSince: now - 11 * 60_000, availability: 'busy' }),
  agent(self, 'r-bap', 'birokrat-ai-platform', { lastActor: 'none' }),
  agent(self, 'r-cww', 'claude-web-workspace', { remoteUrl: '', branch: 'master', managed: false, availability: 'unmanaged', lastActor: 'none' }),
  agent(self, 'r-prg', 'prg', { remoteUrl: 'https://github.com/bojanmirceta/prg.git', branch: 'test', dirty: true, managed: false, availability: 'unmanaged' }),
  agent(self, 'r-prg1', 'prg-copy1', { remoteUrl: 'https://github.com/bojanmirceta/prg.git', branch: 'master' }),
  agent(self, 'r-wfa', 'web-flow-autodev', { branch: 'feature/architecture-tab-collapsible-questions', dirty: true, lastActor: 'none', unseenResult: true }),
];
self.managedCount = self.agents.filter((a) => a.managed).length;

const peers = [
  ['MONSTER', 'src-monster', [['r-webflow', 'web-flow-autodev', { branch: 'feat/exporter', runningSince: now - 125_000, availability: 'busy' }], ['r-prg', 'prg', { unseenResult: true }], ['r-bap', 'birokrat-ai-platform', {}], ['r-biro', 'birokrat', { branch: 'feat/vat-rounding', occupancy: occ(true, 'operator') }]]],
  ['laptop', 'src-laptop', [['r-x', 'x', {}], ['r-notes', 'notes', { branch: 'main', occupancy: occ(true, 'operator') }]], { acceptsSends: false, acceptsUpgrades: false, gateOpen: false, allowSends: false }],
  ['fotrsqlbirokrat', 'src-fotr', [['r-biro', 'birokrat', { runningSince: now - 40 * 60_000, availability: 'busy', branch: 'feat/sql-migration' }], ['r-prg', 'prg', {}], ['r-bap', 'birokrat-ai-platform', { branch: 'feat/rag-index' }], ['r-cw', 'claude-web-this-app', { remoteUrl: 'https://github.com/mirceta/birocode.git' }], ['r-hp', 'homepage', {}]]],
  ['razvoj2016', 'src-razvoj', [['r-prg', 'prg', { branch: 'feature/old-work' }], ['r-biro', 'birokrat', {}]], { version: OLD, behind: true, acceptsUpgrades: true, gateOpen: false, staleTasks: [{ id: 's1', reason: 'unpushed branch', branch: 'feature/old-work', title: 'Kanban: column widths' }] }],
  ['DESKTOP-POAPPP3', 'src-desk', [], { reachable: false, status: 'unreachable', detail: 'timeout after 5 s', version: null, acceptsSends: false, acceptsUpgrades: false, gateOpen: false, collector: { failStreak: 3, nextRetryAt: now + 42_000 } }],
  ['RAZVOJ-PC', 'src-razvojpc', [['r-biro', 'birokrat', { runningSince: now - 5 * 60_000, availability: 'busy', branch: 'feat/invoices' }], ['r-prg', 'prg', { runningSince: now - 90_000, availability: 'busy', branch: 'feat/report' }], ['r-web', 'web-flow-autodev', {}]]],
  ['BIRO-SRV1', 'src-srv1', [['r-bap', 'birokrat-ai-platform', {}], ['r-biro', 'birokrat', { unseenResult: true }], ['r-prg', 'prg', {}], ['r-cw', 'claude-web-this-app', { remoteUrl: 'https://github.com/mirceta/birocode.git', branch: 'feat/hub-fs' }]]],
  ['HP-LAPTOP-2', 'src-hp2', [['r-prg', 'prg', {}]], { gateOpen: false }],
  ['WORKSTATION-7', 'src-ws7', [['r-biro', 'birokrat', { branch: 'feat/eslog' }], ['r-bap', 'birokrat-ai-platform', {}], ['r-prg', 'prg', { branch: 'test', dirty: true }]], { allowSends: false }],
].map(([label, sourceId, agents, extra]) => {
  const m = machine(label, sourceId, extra);
  m.agents = agents.map(([repoId, n, x]) => agent(m, repoId, n, x));
  m.managedCount = m.agents.filter((a) => a.managed).length;
  return m;
});
const fleet = { at: now, hubVersion: HUB, machines: [self, ...peers] };

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'SPACEX4' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/arch/fleet/checked': return { ok: true };
    case '/api/arch/fleet/occupancy': return { ok: true };
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
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));

const VIEWPORT = { width: 1500, height: 950 };
async function open(layout, { viewport = VIEWPORT, colorScheme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  await ctx.addInitScript((lay) => {
    localStorage.setItem('manageapp.layout', 'tabs');
    localStorage.setItem('manageapp.hidden', '[]');
    localStorage.setItem('claudeweb_ui_mode', 'advanced');
    localStorage.removeItem('manageapp.fleetFilters');
    localStorage.setItem('manageapp.fleetAgentsLayout', lay);
    window.__opens = []; window.__posts = [];
    window.open = (url, name) => { window.__opens.push({ url, name }); return { focus() {}, location: { href: '' } }; };
  }, layout);
  const posts = [];
  await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === 'POST') posts.push({ pathname, body: route.request().postDataJSON?.() ?? route.request().postData() });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-agent="src-monster/r-webflow"]', { timeout: 60000 });
  await page.waitForTimeout(300);
  return { ctx, page, errs, posts };
}

const PANE = '[data-status-pane]';
const geometry = (page) => page.evaluate(() => {
  const pane = document.querySelector('[data-status-pane]');
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) }; };
  const paneRect = pane.getBoundingClientRect();
  const machines = [...document.querySelectorAll('[data-machine]')].map((el) => ({ name: el.dataset.machine, height: Math.round(el.getBoundingClientRect().height), fullyVisible: el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().bottom <= window.innerHeight, factKeys: [...el.querySelectorAll('[data-fact]')].map((f) => f.dataset.fact) }));
  const chipW = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().width) : null; };
  // One string per section — in merged mode the list is occupied-then-free (status-agents-attention
  // D4), so it is read as two groups by the chip's occupancy, each expected running → finished → idle.
  const code = (c) => (c.dataset.running === 'true' ? 'R' : c.dataset.finishedUnchecked ? 'F' : 'i');
  const sectionOrder = [
    ...[...document.querySelectorAll('[data-occ-section]')].map((s) => [...s.querySelectorAll('[data-agent]')].map(code).join('')),
    ...[...document.querySelectorAll('[data-occupancy-merged]')].flatMap((s) => { const chips = [...s.querySelectorAll('[data-agent]')]; return [chips.filter((c) => c.dataset.occupied === 'true').map(code).join(''), chips.filter((c) => c.dataset.occupied !== 'true').map(code).join('')]; }),
  ];
  const stickyBg = (() => { const h = document.querySelector('[data-fleet-head]'); return h ? getComputedStyle(h).backgroundColor : null; })();
  return {
    scrollTop: pane.scrollTop, scrollWidth: pane.scrollWidth, clientWidth: pane.clientWidth, docScrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    paneTop: Math.round(paneRect.top), head: r('[data-fleet-head]'), tabs: r('[data-fleet-tabs]'), bar: r('[data-filter-bar]'), firstMachine: r('[data-machine]'),
    machines, totalMachineHeight: machines.reduce((n, m) => n + m.height, 0), fullyVisible: machines.filter((m) => m.fullyVisible).length,
    runningChipW: chipW('[data-agent="src-monster/r-webflow"]'), idleChipW: chipW('[data-agent="src-monster/r-bap"]'), finishedChipW: chipW('[data-agent="src-monster/r-prg"]'),
    sectionOrder, stickyBg,
  };
});

// ---- split layout: top, scrolled, full ------------------------------------------------------
const split = await open('split');
const g0 = await geometry(split.page);
await split.page.screenshot({ path: path.join(OUT, `fleet-status-compact-${name}-top.png`) });
await split.page.$eval(PANE, (el) => { el.scrollTop = 900; });
await split.page.waitForTimeout(200);
const g1 = await geometry(split.page);
await split.page.screenshot({ path: path.join(OUT, `fleet-status-compact-${name}-scrolled.png`) });
await split.page.$eval(PANE, (el) => { el.scrollTop = 0; });
await (await split.page.$('.fs')).screenshot({ path: path.join(OUT, `fleet-status-compact-${name}-full.png`) });

// ---- behaviour still intact ------------------------------------------------------------------
const shown = () => split.page.$eval('[data-shown]', (el) => Number(el.dataset.shown));
const allShown = await shown();
await split.page.click('[data-filter="running"]');
const runningShown = await shown();
await split.page.click('[data-machine-filter="src-monster"]');
const monsterRunning = await shown();
await split.page.click('[data-clear-filters]');
const cleared = await shown();
await split.page.fill('[data-search]', 'prg');
await split.page.waitForTimeout(100);
const searched = await shown();
await split.page.fill('[data-search]', '');
await split.page.click('[data-layout-set="merged"]');
const mergedOn = await split.page.$$eval('[data-occupancy-merged]', (els) => els.length);
await split.page.click('[data-layout-set="split"]');
const splitBack = await split.page.$$eval('[data-occ-section]', (els) => els.length);
await split.page.click('[data-agent="src-monster/r-bap"]');
const detailOpen = !!(await split.page.$('[data-detail="src-monster/r-bap"]'));
await split.page.click('[data-occupancy-set="occupied"]');
await split.page.waitForTimeout(100);
const occPost = split.posts.find((p) => p.pathname === '/api/arch/fleet/occupancy');
await split.page.click('[data-agent="src-monster/r-bap"]');
const detailClosed = !(await split.page.$('[data-detail="src-monster/r-bap"]'));
await split.page.dblclick('[data-agent="src-monster/r-webflow"]');
const opens = await split.page.evaluate(() => window.__opens.slice());
const bangBefore = await split.page.$$eval('[data-finished-unchecked]', (els) => els.length);
await split.page.click('[data-mark-checked="src-monster/r-prg"]');
await split.page.waitForTimeout(100);
const bangAfter = await split.page.$$eval('[data-finished-unchecked]', (els) => els.length);
const checkedPost = split.posts.find((p) => p.pathname === '/api/arch/fleet/checked');
const splitErrs = split.errs;
await split.ctx.close();

// ---- merged layout ---------------------------------------------------------------------------
const merged = await open('merged');
await merged.page.waitForSelector('[data-occupancy-merged]', { timeout: 10000 });
const gm = await geometry(merged.page);
await merged.page.screenshot({ path: path.join(OUT, `fleet-status-compact-${name}-merged.png`) });
const mergedErrs = merged.errs;
await merged.ctx.close();

// ---- a narrow pane (a side-by-side dashboard) and the dark scheme: no overflow either way ----
const narrow = await open('split', { viewport: { width: 760, height: 900 } });
const gn = await geometry(narrow.page);
await narrow.page.screenshot({ path: path.join(OUT, `fleet-status-compact-${name}-narrow.png`) });
const narrowErrs = narrow.errs;
await narrow.ctx.close();
const dark = await open('split', { colorScheme: 'dark' });
const gd = await geometry(dark.page);
await dark.page.screenshot({ path: path.join(OUT, `fleet-status-compact-${name}-dark.png`) });
await dark.ctx.close();

await browser.close();
await server.close();

const sameColumns = (g) => g.machines.length === 10 && g.machines.every((m) => m.factKeys.join(',') === g.machines[0].factKeys.join(',')) && g.machines[0].factKeys.length > 0;
const runningFirst = (g) => g.sectionOrder.every((s) => /^R*F*i*$/.test(s));
const result = {
  fourMachinesOnTheFirstScreen: g0.fullyVisible >= 4 && gm.fullyVisible >= 5,
  // The pane never overflows; the document is checked at the dashboard viewport only — at 760 px the
  // Management top nav (not this tab) is wider than the window, as before this change.
  noHorizontalOverflow: [g0, gm, gn, gd].every((g) => g.scrollWidth <= g.clientWidth) && [g0, gm, gd].every((g) => g.docScrollWidth <= g.innerWidth),
  narrowStillPinnedAndColumned: gn.head !== null && sameColumns(gn) && narrowErrs.length === 0,
  headPinnedWhileScrolled: g1.scrollTop > 0 && g1.head !== null && g1.head.top === g1.paneTop && g1.bar.bottom > g1.paneTop && g1.firstMachine.top < g1.bar.bottom,
  headHasSolidBackground: !!g1.stickyBg && g1.stickyBg !== 'rgba(0, 0, 0, 0)' && g1.stickyBg !== 'transparent',
  sameFactsColumnsOnEveryMachine: sameColumns(g0),
  runningChipBiggerThanIdle: g0.runningChipW > g0.idleChipW && g0.finishedChipW > g0.idleChipW,
  runningFirstInEverySection: runningFirst(g0) && runningFirst(gm),
  filtersStillWork: allShown === 30 && runningShown === 8 && monsterRunning === 2 && cleared === 30 && searched > 0 && searched < 30,
  splitMergedSwitchWorks: mergedOn === 9 && splitBack === 18,
  clickExpandsAndCollapses: detailOpen && detailClosed,
  occupancyToggleWorks: !!occPost && occPost.body?.occupied === true && occPost.body?.repoId === 'r-bap',
  dblclickOpensHarness: opens.length === 1 && opens[0].name === 'birocode-agent-src-monster_r-webflow',
  bangAndCheckedWork: bangBefore === 3 && bangAfter === 2 && !!checkedPost && checkedPost.body?.repoId === 'r-prg',
  noPageErrors: splitErrs.length === 0 && mergedErrs.length === 0,
};
console.log(JSON.stringify({ name, narrow: { scrollWidth: gn.scrollWidth, clientWidth: gn.clientWidth, docScrollWidth: gn.docScrollWidth, innerWidth: gn.innerWidth, fullyVisible: gn.fullyVisible }, dark: { scrollWidth: gd.scrollWidth, clientWidth: gd.clientWidth, docScrollWidth: gd.docScrollWidth, innerWidth: gd.innerWidth }, top: { head: g0.head, tabs: g0.tabs, bar: g0.bar, firstMachine: g0.firstMachine, totalMachineHeight: g0.totalMachineHeight, fullyVisible: g0.fullyVisible, mergedFullyVisible: gm.fullyVisible, machines: g0.machines.map((m) => [m.name, m.height]), runningChipW: g0.runningChipW, idleChipW: g0.idleChipW, sectionOrder: g0.sectionOrder }, scrolled: { scrollTop: g1.scrollTop, paneTop: g1.paneTop, head: g1.head, bar: g1.bar, firstMachine: g1.firstMachine, stickyBg: g1.stickyBg }, mergedTotalMachineHeight: gm.totalMachineHeight, counts: { allShown, runningShown, monsterRunning, cleared, searched, mergedOn, splitBack, bangBefore, bangAfter }, result }, null, 1));
if (assertNow) {
  const failed = Object.entries(result).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length) { console.error('FAILED:', failed.join(', ')); process.exit(1); }
}
