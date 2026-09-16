// Evidence shot for fleet task a25ee2de (Status tab: build / fleet info as badges):
// render the Management App's Status tab against a MOCKED fleet — one machine on the
// hub build with a full overview, one reachable peer on an older build with no
// overview, one unreachable — and screenshot the Agents subtab (first agent's detail
// open) and the Overview subtab. With SHOT_ASSERT=1 it also asserts in the page that
// the machine headers and the Overview's toned values render as badges and that no
// "a · b · c" raw-text run is left in a machine header.
//
//   node client/tests/ui/shot-status-badges.mjs                       (after; asserts)
//   SHOT_NAME=before SHOT_ASSERT=0 node client/tests/ui/shot-status-badges.mjs
// Output: .claudeweb-preview/status-badges-{agents,overview}-<SHOT_NAME|after>.png

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', '.claudeweb-preview');
mkdirSync(OUT, { recursive: true });
const name = process.env.SHOT_NAME || 'after';
const assertNow = (process.env.SHOT_ASSERT ?? '1') !== '0';

const now = Date.now();
const HUB = '1.0.0+a4da6d70c3e1f9b2d4e5f60718293a4b5c6d7e8f';
const OLD = '1.0.0+553fb73e642d6220e9c70e4ea483403067cf85d9';
const iso = (ms) => new Date(ms).toISOString();
const fullOverview = {
  capturedAt: now - 20_000,
  claude: { installed: true, authenticated: true, account: 'bojan', plan: 'Max', usage: { available: true, session: { percent: 23, resetsAt: iso(now + 2 * 3600_000), severity: 'normal' }, weekly: { percent: 61, resetsAt: iso(now + 3 * 86400_000), severity: 'normal' }, scopedWeekly: [{ label: 'Opus', percent: 92, resetsAt: iso(now + 3 * 86400_000) }], fetchedAt: iso(now - 40_000), stale: false } },
  github: { installed: true, authenticated: true, account: 'mirceta-agents', host: 'github.com' },
  host: { nowUnixMs: now, utcOffsetMinutes: 120, timeZoneId: 'Central European Summer Time' },
  admin: { supported: true, state: 'active', registrySet: true, elevated: false },
  watchdog: { supported: true, state: 'healthy' },
};
const repos = [
  { name: 'Claude Web (this app)', slug: 'claude-web-this-app', remote: 'https://github.com/mirceta/birocode.git' },
  { name: 'prg', slug: 'prg', remote: 'https://github.com/acme/prg.git' },
];
const agentsOf = (m, mi) => repos.map((r, ri) => ({
  handle: `${m.label}/${r.slug}`, key: `${m.self ? 'self' : m.sourceId}/${r.slug}-${mi}`, repoId: `${r.slug}-${mi}`, name: r.name, remoteUrl: r.remote,
  branch: ri === 0 ? 'feature/status-tab-badges' : 'main', defaultBranch: 'main', onDefault: ri !== 0, dirty: ri === 0, availability: ri === 0 ? 'claimed' : 'available',
  claimedReason: ri === 0 ? 'human-active' : undefined, lastActor: ri === 0 ? 'human' : 'arch', runningSince: mi === 0 && ri === 0 ? now - 125_000 : null,
  managed: true, docked: true, exists: true, tabId: 't1', pinned: ri === 0 && mi === 0, goal: mi === 1 && ri === 1 ? { id: 'g7', name: 'Deploy train' } : undefined,
}));
const machines = [
  { label: 'fotrsqlbirokrat', self: true, sourceId: 'self', address: null, reachable: true, status: 'ok', detail: null, version: HUB, behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2, overview: fullOverview },
  { label: 'razvoj2016', self: false, sourceId: 'src-razvoj', address: 'http://192.168.0.20:5099', reachable: true, status: 'ok', detail: null, version: OLD, behind: true, acceptsSends: true, acceptsUpgrades: true, gateOpen: false, allowSends: false, managedCount: 2, overview: null },
  { label: 'DESKTOP-POAPPP3', self: false, sourceId: 'src-desk', address: 'http://192.168.0.31:5099', reachable: false, status: 'unreachable', detail: 'timeout after 5 s', version: null, behind: false, acceptsSends: false, acceptsUpgrades: false, gateOpen: false, allowSends: true, managedCount: 0, overview: null },
];
const fleet = {
  at: now, hubVersion: HUB,
  machines: machines.map((m, mi) => ({
    machine: m.label, sourceId: m.sourceId, self: m.self, address: m.address, reachable: m.reachable, status: m.status, detail: m.detail, version: m.version, behind: m.behind,
    acceptsSends: m.acceptsSends, acceptsUpgrades: m.acceptsUpgrades, gateOpen: m.gateOpen, allowSends: m.allowSends, managedCount: m.managedCount, overview: m.overview,
    staleTasks: mi === 1 ? [{ id: 's1', reason: 'unpushed branch', branch: 'feature/old-work', title: 'Kanban: column widths' }] : [],
    agents: m.reachable ? agentsOf(m, mi) : [],
  })),
};

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'fotrsqlbirokrat' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return { staleHours: 24, nodes: [], edges: [], machines: [] };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.removeItem('manageapp.fleetFilters');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shots = [];

// Agents subtab, first agent's detail open.
await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('[data-agent]', { timeout: 60000 });
await page.click('[data-agent]');
await page.waitForSelector('.fs__detail', { timeout: 10000 });
await page.waitForTimeout(300);
const agentsShot = path.join(OUT, `status-badges-agents-${name}.png`);
await (await page.$('main') || page).screenshot({ path: agentsShot });
shots.push(agentsShot);
const headerRaw = await page.$$eval('.fs__mh .fs__dim', (els) => els.map((e) => e.textContent.trim()).filter((t) => t.includes(' · ')));
const headerBadges = await page.$$eval('.fs__mh .fs__badge', (els) => els.length);
const detailBadges = await page.$$eval('.fs__detail .fs__badge', (els) => els.length);
const headerLabels = await page.$$eval('.fs__mlabel', (els) => els.map((e) => e.textContent.trim()));
const chipLabels = await page.$$eval('[data-agent] .fs__chip-name', (els) => els.map((e) => e.dataset.label || e.textContent.trim()));
const hooks = await page.$$eval('[data-claimed-reason],[data-driven-by-goal]', (els) => els.length);

// Overview subtab: taller viewport so every machine's groups are in the shot.
await page.setViewportSize({ width: 1180, height: 1500 });
await page.click('[data-fleet-tab="overview"]');
await page.waitForSelector('[data-fleet-overview] .fs__ov-row', { timeout: 10000 });
await page.waitForTimeout(300);
const overviewShot = path.join(OUT, `status-badges-overview-${name}.png`);
await (await page.$('main') || page).screenshot({ path: overviewShot });
shots.push(overviewShot);
const ovRows = await page.$$eval('[data-fleet-overview] .fs__ov-row', (els) => els.map((e) => ({
  label: e.dataset.ovLabel, tone: e.dataset.ovTone, meter: !!e.querySelector('.fs__ov-bar'), badge: !!e.querySelector('.fs__badge'), text: e.querySelector('dd')?.textContent.trim(),
})));
const tonedNoBadge = ovRows.filter((r) => r.tone !== 'plain' && !r.meter && !r.badge);
const ovLabels = new Set(ovRows.map((r) => r.label));

// The same Agents view under the dark scheme (the app's theme follows the OS).
const dark = await browser.newContext({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await dark.addInitScript(() => { localStorage.setItem('manageapp.layout', 'tabs'); localStorage.setItem('manageapp.hidden', '[]'); localStorage.setItem('claudeweb_ui_mode', 'advanced'); });
await dark.route((u) => u.pathname.startsWith('/api/'), (route) => { const { pathname } = new URL(route.request().url()); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) }); });
const dpage = await dark.newPage();
dpage.on('pageerror', (e) => errs.push(e.message));
await dpage.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await dpage.waitForSelector('[data-agent]', { timeout: 60000 });
await dpage.click('[data-agent]');
await dpage.waitForSelector('.fs__detail', { timeout: 10000 });
await dpage.waitForTimeout(300);
const darkShot = path.join(OUT, `status-badges-agents-dark-${name}.png`);
await (await dpage.$('main') || dpage).screenshot({ path: darkShot });
shots.push(darkShot);
await dark.close();
await browser.close();
await server.close();

const report = { name, headerLabels, headerBadges, headerRawRuns: headerRaw, detailBadges, dataHooks: hooks, chipLabels, overviewRows: ovRows.length, overviewLabels: ovLabels.size, tonedRowsWithoutBadge: tonedNoBadge.map((r) => `${r.label}: ${r.text}`), pageErrors: errs, out: shots };
console.log(JSON.stringify(report, null, 1));
if (!assertNow) process.exit(errs.length === 0 ? 0 : 1);
const ok = errs.length === 0
  && headerRaw.length === 0 && headerBadges > 0 && detailBadges > 0 && hooks >= 2
  && headerLabels.length === machines.length
  && chipLabels.every((l) => !l.includes('/'))
  && tonedNoBadge.length === 0 && ovRows.length > 0;
process.exit(ok ? 0 : 1);
