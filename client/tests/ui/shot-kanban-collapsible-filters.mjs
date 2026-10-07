// Evidence shots for fleet task 4e047c9e (openspec kanban-collapsible-filters): the Kanban's
// filter bar folds. Same viewport throughout:
//   kanban-filters-before.png   — the controls expanded, exactly as the bar was (the "before")
//   kanban-filters-collapsed.png — folded, three active filters as summary chips + count badge
//   kanban-filters-graph.png    — the Task graph shares the bar, so it folds too
// Then the behaviour: default collapsed; the toggle works with the keyboard (Enter / Space);
// a chip's × clears that one filter without expanding; "clear all"; the fold survives a
// reload; the filter in the URL keeps working; the board's columns start right under the
// folded line (no empty strip).
//
//   node client/tests/ui/shot-kanban-collapsible-filters.mjs
// Board: client/tests/ui/fixtures/kanban-live.json when present (real cards captured from a
// harness), else the mocked board below.

import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const fleet = {
  at: Date.now(), hubVersion: '1.0.0+test',
  machines: [
    { machine: 'razvoj2016', sourceId: 'self', self: true, reachable: true, status: 'ok', version: '1.0.0+test', gateOpen: true, allowSends: true, acceptsSends: true, managedCount: 2,
      agents: [
        { handle: 'razvoj2016/birocode#1', key: 'self/birocode', repoId: 'r-web', name: 'birocode', remoteUrl: 'https://github.com/acme/birocode.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', running: false },
        { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', running: false },
      ] },
    { machine: 'spacex', sourceId: 'hub-spacex', self: false, reachable: true, status: 'ok', version: '1.0.0+test', gateOpen: true, allowSends: true, acceptsSends: true, managedCount: 1,
      agents: [
        { handle: 'spacex/webflow#1', key: 'hub-spacex/webflow', repoId: 'r-webflow', name: 'webflow', remoteUrl: 'https://github.com/acme/webflow.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', running: true },
      ] },
  ],
};
const who = (repoId, status, sourceId = null) => ({ repoId, sourceId, status });
const node = (id, title, status, repoId, extra = {}) => ({ id, title, note: '', status, repoId, sourceId: extra.sourceId || null, assignees: repoId ? [who(repoId, status, extra.sourceId || null)] : [], x: 0, y: 0, createdAt: 1, updatedAt: Date.now() - 300_000, ...extra });
const mockBoard = {
  staleHours: 24, edges: [], machines: [], scratch: '',
  nodes: [
    node('a1b2c3d4e5f6', 'Kanban: collapsible filter section with a one-line summary', 'doing', 'r-web', { dispatchedAt: Date.now() - 900_000, dispatchCount: 1 }),
    node('b2c3d4e5f6a1', 'Fleet Status: keep-alive column per machine', 'pr-opened', 'r-web', { branch: 'feat/harness-watchdog', pushed: true, prUrl: 'https://github.com/acme/birocode/pull/91', prNumber: 91 }),
    node('c3d4e5f6a1b2', 'Ideas consumed on promotion', 'pr-merged', 'r-web', { branch: 'feat/ideas-consume', prUrl: 'https://github.com/acme/birocode/pull/67', prNumber: 67, mergeCommit: 'deadbeefcafe' }),
    node('d4e5f6a1b2c3', 'Kanban assignee colour chips', 'done', 'r-web', { mergeCommit: 'feedfacefeed' }),
    node('e5f6a1b2c3d4', 'Export the invoice register as CSV', 'todo', 'r-prg'),
    node('f6a1b2c3d4e5', 'Write the release notes for 2.4', 'todo', null),
    node('0a57d282e303', 'prg: committed on a branch, not yet pushed', 'committed', 'r-prg', { branch: 'feat/csv', pushed: false }),
    node('9f8e7d6c5b4a', 'webflow: landing page hero rewrite', 'doing', 'r-webflow', { sourceId: 'hub-spacex', dispatchedAt: Date.now() - 4_000_000, dispatchCount: 2 }),
    node('8e7d6c5b4a39', 'webflow: pricing table from the CMS', 'todo', 'r-webflow', { sourceId: 'hub-spacex' }),
    node('7d6c5b4a3928', 'prg: nightly backup verification', 'doing', 'r-prg', { dispatchedAt: Date.now() - 100_000, dispatchCount: 1 }),
  ],
};
const fixture = path.resolve(clientRoot, 'tests', 'ui', 'fixtures', 'kanban-live.json');
const board = existsSync(fixture) ? JSON.parse(readFileSync(fixture, 'utf8')) : mockBoard;
const liveCards = existsSync(fixture);

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/taskgraph/policeman': return { settings: { enabled: false }, rows: [], journal: [] };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    case '/api/ideas': return [];
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1380, height: 760 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const fold = () => page.$eval('[data-task-filter-fold="kanban"]', (e) => e.dataset.fold);
const chips = () => page.$$eval('[data-task-filter-fold="kanban"] [data-summary-chip]', (els) => els.map((e) => e.dataset.summaryChip));
const shown = () => page.$eval('[data-task-filter-fold="kanban"] .tf__shown', (e) => ({ shown: Number(e.dataset.shown), total: Number(e.dataset.total) }));
const gap = () => page.evaluate(() => {
  // The vertical distance from the folded line's bottom to the layout toolbar / first column.
  const f = document.querySelector('[data-task-filter-fold="kanban"]').getBoundingClientRect();
  const l = document.querySelector('[data-kanban-layout]').getBoundingClientRect();
  const c = document.querySelector('section[data-column]').getBoundingClientRect();
  return { foldHeight: Math.round(f.height), toLayout: Math.round(l.top - f.bottom), toColumns: Math.round(c.top - f.bottom) };
});

// 1) First visit, no filter: collapsed by default, "no filters", the expanded bar absent.
await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-task-filter-fold="kanban"] [data-filters-toggle]', { timeout: 15000 });
await page.waitForSelector('section[data-column] .kb__card', { timeout: 15000 });
const first = { fold: await fold(), none: !!(await page.$('[data-filters-none]')), bar: !!(await page.$('[data-task-filter-bar="kanban"]')), gap: await gap() };

// 2) Expand with the keyboard (focus the toggle, press Enter): the controls as before.
await page.focus('[data-filters-toggle]');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-task-filter-bar="kanban"]', { timeout: 5000 });
const expanded = { fold: await fold(), ariaExpanded: await page.$eval('[data-filters-toggle]', (b) => b.getAttribute('aria-expanded')), search: !!(await page.$('[data-task-search]')), groups: await page.$$eval('[data-filter-group]', (els) => els.map((e) => e.dataset.filterGroup)) };
// Set three filters the way the Operator does, in the expanded controls.
const machineKey = await page.$eval('[data-filter-group="machine"] [data-machine-chip]:not([data-machine-chip="unassigned"])', (e) => e.dataset.machineChip);
await page.click(`[data-machine-chip="${machineKey}"]`);
await page.click('[data-state-chip="doing"]');
await page.fill('[data-task-search]', 'prg');
await page.waitForFunction(() => Number(document.querySelector('[data-task-filter-fold="kanban"] .tf__shown')?.dataset.shown) >= 0);
const expandedShown = await shown();
const urlExpanded = page.url();
await shotMain('kanban-filters-before.png');

// 3) Fold with Space: one line — three chips, the badge, clear all, the shown count.
await page.focus('[data-filters-toggle]');
await page.keyboard.press('Space');
await page.waitForFunction(() => document.querySelector('[data-task-filter-fold="kanban"]')?.dataset.fold === 'collapsed');
const collapsed = {
  fold: await fold(), chips: await chips(), badge: await page.$eval('[data-filters-count]', (e) => Number(e.dataset.filtersCount)),
  clearAll: !!(await page.$('[data-task-filter-fold="kanban"] [data-clear-task-filters]')), bar: !!(await page.$('[data-task-filter-bar="kanban"]')),
  shown: await shown(), line: await page.$eval('[data-task-filter-fold="kanban"] .tf-fold__line', (e) => e.textContent.replace(/\s+/g, ' ').trim()), gap: await gap(),
};
await shotMain('kanban-filters-collapsed.png');

// 4) A chip's × clears that one filter without expanding; the others stay; the URL follows.
await page.click('[data-summary-clear="states:doing"]');
await page.waitForFunction(() => !document.querySelector('[data-summary-chip="states:doing"]'));
const afterX = { fold: await fold(), chips: await chips(), url: page.url(), shown: await shown() };

// 5) Reload: the fold and the filter (from the URL) both survive.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-task-filter-fold="kanban"] [data-filters-toggle]', { timeout: 15000 });
await page.waitForSelector('section[data-column] .kb__card', { timeout: 15000 });
const reloaded = { fold: await fold(), chips: await chips(), url: page.url() };

// 6) Clear all from the folded line.
await page.click('[data-task-filter-fold="kanban"] [data-clear-task-filters]');
await page.waitForFunction(() => !!document.querySelector('[data-filters-none]'));
const cleared = { chips: await chips(), none: !!(await page.$('[data-filters-none]')), shown: await shown(), url: page.url() };

// 7) The Task graph shares the bar: the same fold state, the same summary when a filter is set.
await page.click('[data-task-filter-fold="kanban"] [data-filters-toggle]');
await page.waitForSelector('[data-task-filter-bar="kanban"]', { timeout: 5000 });
await page.click('[data-state-chip="doing"]');
await page.click('[data-task-filter-fold="kanban"] [data-filters-toggle]');
await page.goto(`${base}/manage.html?tab=graph&layout=tabs&state=doing`, { waitUntil: 'domcontentloaded' });
const graphFold = await page.waitForSelector('[data-task-filter-fold="graph"]', { timeout: 15000 }).then(() => page.$eval('[data-task-filter-fold="graph"]', (e) => ({ fold: e.dataset.fold, chips: [...e.querySelectorAll('[data-summary-chip]')].map((c) => c.dataset.summaryChip), hideToggle: !!e.querySelector('[data-hide-filtered]') }))).catch(() => null);
if (graphFold) await shotMain('kanban-filters-graph.png');

await browser.close();
await server.close();

const checks = {
  collapsedByDefault: first.fold === 'collapsed' && first.none && !first.bar,
  keyboardExpands: expanded.fold === 'expanded' && expanded.ariaExpanded === 'true' && expanded.search && expanded.groups.includes('machine') && expanded.groups.includes('state'),
  filtersNarrowWhileExpanded: expandedShown.shown < expandedShown.total,
  keyboardCollapses: collapsed.fold === 'collapsed' && !collapsed.bar,
  threeChipsAndBadge: collapsed.chips.length === 3 && collapsed.badge === 3 && collapsed.chips.includes(`machines:${machineKey}`) && collapsed.chips.includes('states:doing') && collapsed.chips.includes('q:prg'),
  clearAllOffered: collapsed.clearAll,
  sameNarrowingWhenFolded: collapsed.shown.shown === expandedShown.shown && collapsed.shown.total === expandedShown.total,
  chipXClearsOneWithoutExpanding: afterX.fold === 'collapsed' && afterX.chips.length === 2 && !afterX.chips.includes('states:doing') && !/state=doing/.test(afterX.url) && /q=prg/.test(afterX.url),
  foldAndFilterSurviveReload: reloaded.fold === 'collapsed' && reloaded.chips.length === 2 && /q=prg/.test(reloaded.url),
  clearAllClears: cleared.chips.length === 0 && cleared.none && cleared.shown.shown === cleared.shown.total && !/q=prg/.test(cleared.url),
  boardGainsTheHeight: collapsed.gap.foldHeight < first.gap.foldHeight + 4 && collapsed.gap.toLayout <= 12 && collapsed.gap.toColumns <= 60,
  graphSharesTheFold: !graphFold || (graphFold.fold === 'collapsed' && graphFold.chips.includes('states:doing') && graphFold.hideToggle),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ liveCards, first, expanded, expandedShown, urlExpanded, collapsed, afterX, reloaded, cleared, graphFold, pageErrors: errs, checks }, null, 2));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
