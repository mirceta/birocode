// Evidence shot for the Policeman tab's "Responsibilities" view (openspec
// policeman-responsibilities-tab): renders the Management App against a mocked board, opens
// Kanban → Policeman → Responsibilities, asserts the grouped table is there (every group with
// rows, every row with four cells and a source), that the filter narrows to matching rows and
// hides the vocabulary while filtering, that an unmatched filter shows the honest empty line,
// and that the choice of view survives a reload; screenshots the full table and a filtered one.
//
//   node client/tests/ui/shot-kanban-policeman-duties.mjs
// Output: docs/screenshots/kanban-policeman-duties.png, kanban-policeman-duties-handoff.png

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
    case '/api/taskgraph/policeman': return { running: false, lastAt: now - 20_000, nextDueAt: now + 40_000, intervalSeconds: 60, passes: 3, settings: { enabled: true, model: 'haiku', tail: 4, maxQuestionsPerPass: 8 }, cards: [], history: [], cardsSeen: [], integrity: board.integrity, last: { trigger: 'timer', checked: 0, probed: 0, durationMs: 12 } };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
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
await page.click('[data-policeman-view="duties"]');
await page.waitForSelector('[data-policeman-duties]', { timeout: 15000 });
const table = await page.evaluate(() => {
  const groups = [...document.querySelectorAll('[data-policeman-duties-group]')].map((g) => ({ key: g.dataset.policemanDutiesGroup, rows: g.querySelectorAll('[data-policeman-duty]').length, title: g.querySelector('h3')?.textContent || '' }));
  const rows = [...document.querySelectorAll('[data-policeman-duty]')];
  const complete = rows.every((r) => r.querySelectorAll('td').length === 4 && [...r.querySelectorAll('td')].every((td) => td.textContent.trim()) && r.querySelector('.pr__src')?.textContent.trim());
  return { groups, rows: rows.length, complete, count: document.querySelector('[data-policeman-duties-count]')?.textContent, vocab: !!document.querySelector('[data-policeman-duties-vocab]'), vocabRows: document.querySelectorAll('[data-policeman-duties-vocab] tbody tr').length };
});
await shotMain('kanban-policeman-duties.png');

// Filter: "handoff" narrows to rows that say so; the vocabulary steps aside while filtering.
await page.fill('[data-policeman-duties-filter]', 'handoff');
await page.waitForFunction(() => /of \d+ rules/.test(document.querySelector('[data-policeman-duties-count]')?.textContent || ''), null, { timeout: 5000 });
const filtered = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-policeman-duty]').length,
  allMention: [...document.querySelectorAll('[data-policeman-duty]')].every((r) => /handoff/i.test(r.textContent)),
  count: document.querySelector('[data-policeman-duties-count]')?.textContent,
  vocab: !!document.querySelector('[data-policeman-duties-vocab]'),
}));
await shotMain('kanban-policeman-duties-handoff.png');
await page.fill('[data-policeman-duties-filter]', 'zzz-nothing');
await page.waitForSelector('[data-policeman-duties-empty]', { timeout: 5000 });
const emptyText = await page.$eval('[data-policeman-duties-empty]', (e) => e.textContent);

// The view choice is remembered across a reload.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-policeman-views]', { timeout: 15000 });
const onAfterReload = await page.$eval('[data-policeman-view="duties"]', (e) => e.getAttribute('aria-selected'));
const dutiesAfterReload = !!(await page.$('[data-policeman-duties]'));
await browser.close();
await server.close();

const result = {
  dutiesViewListedBetweenWhatItIsAndHowItWorks: views.join(',') === 'sweep,history,explain,duties,how',
  sevenGroupsInPassOrder: table.groups.map((g) => g.key).join(',') === 'domain,trace,move,judge,read,flag,clear',
  everyGroupHasRows: table.groups.every((g) => g.rows >= 3) && table.rows >= 40,
  everyRowComplete: table.complete && /^\d+ rules$/.test(table.count || ''),
  vocabularyShown: table.vocab && table.vocabRows === 8,
  filterNarrows: filtered.rows > 0 && filtered.rows < table.rows && filtered.allMention && /of \d+ rules/.test(filtered.count || '') && filtered.vocab === false,
  emptyFilterIsHonest: /No rule mentions/.test(emptyText),
  viewRemembered: onAfterReload === 'true' && dutiesAfterReload,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ views, table, filtered, emptyText, pageErrors: errs, result, out: ['kanban-policeman-duties.png', 'kanban-policeman-duties-handoff.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
