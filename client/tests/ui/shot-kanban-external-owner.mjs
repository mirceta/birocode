// Evidence shots for openspec kanban-external-owner: the Kanban rendered against a MOCKED
// board with one card owned by an external human developer (lying facts, to prove it is not
// judged), one manual, one both, and one of ours. Asserts the Owner section names the owner
// and says it is out of our domain, the Board check reads "External owner" (never "Not
// verified yet" / "Needs human"), the card is styled distinctly, the policeman line counts it,
// the `external owner` filter chip exists, the detail lets you hand a card over (POST
// …/owner) and disables Ping, and "Ours again" clears it inline (DELETE …/owner) after
// which the card is judged again.
//
//   node client/tests/ui/shot-kanban-external-owner.mjs
// Output: docs/screenshots/kanban-external-owner.png, kanban-external-owner-detail.png

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
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'razvoj2016', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2, agents: [
  { handle: 'razvoj2016/birocode#1', key: 'self/birocode', repoId: 'r-web', name: 'birocode', remoteUrl: 'https://github.com/acme/birocode.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: now - 60_000, managed: true, docked: true, exists: true, tabId: 't1' },
  { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
] }] };
const who = (repoId, status, extra = {}) => ({ repoId, sourceId: null, status, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, updatedAt: now - 30 * H, ...extra });
const node = (id, title, status, repoId, extra = {}) => ({ id, title, note: '', status, repoId, sourceId: null, assignees: repoId ? [who(repoId, status, extra.assignee || {})] : [], x: 0, y: 0, createdAt: 1, updatedAt: now - 30 * H, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, createdBy: 'arch', ...extra });
const OURS = 'a1b2c3d4e5f6', THEIRS = 'b2c3d4e5f6a1', MANUAL = 'c3d4e5f6a1b2', BOTH = 'd4e5f6a1b2c3';
const lying = { branch: 'feat/billing-export', pushed: false, verifiedStatus: 'doing', verifiedAt: now - 2 * 60_000, warning: 'claimed pr-opened, verified: doing — branch not on origin', assignee: { verifiedStatus: 'doing', warning: 'claimed pr-opened, verified: doing — branch not on origin', branch: 'feat/billing-export', pushed: false } };
const board = {
  staleHours: 24, machines: [], scratch: '', goal: 'Ship the invoice CSV export by Friday.', goalUpdatedAt: now - 2 * H,
  edges: [],
  nodes: [
    node(OURS, 'Kanban card sections', 'doing', 'r-web', { updatedAt: now - 10 * 60_000, assignee: { updatedAt: now - 10 * 60_000 } }),
    node(THEIRS, 'Billing export for the Acme tenant', 'pr-opened', 'r-prg', { externalOwner: 'Jane Doe (Acme)', externalOwnerAt: now - 3 * H, ...lying }),
    node(MANUAL, 'Write the release notes for 2.4', 'todo', 'r-web', { manual: true, manualAt: now - H }),
    node(BOTH, 'Migrate the legacy invoice table', 'doing', 'r-prg', { manual: true, manualAt: now - 2 * H, externalOwner: 'Marko', externalOwnerAt: now - H }),
  ],
  integrity: { checkedAt: now - 20_000, cards: 4, honest: 1, dishonest: 0, stuck: 0, manual: 1, external: 2, flagged: [] },
};
const calls = [];
function mock(pathname, method, body) {
  const owner = /^\/api\/taskgraph\/nodes\/([^/]+)\/owner$/.exec(pathname);
  if (owner) {
    calls.push({ method, pathname, body });
    const n = board.nodes.find((x) => x.id === owner[1]);
    if (method === 'POST') { n.externalOwner = body?.name || null; n.externalOwnerAt = Date.now(); }
    if (method === 'DELETE') { n.externalOwner = null; n.externalOwnerAt = null; }
    board.integrity.external = board.nodes.filter((x) => x.externalOwner).length;
    return n;
  }
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: { visible: ['todo', 'doing', 'committed', 'pr-opened', 'done'], widths: { todo: 300, doing: 340, committed: 300, 'pr-opened': 340, done: 260 } } };
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
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname } = new URL(req.url());
  let body = null;
  try { body = req.postDataJSON(); } catch { body = null; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, req.method(), body)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const card = (id) => `[data-task="${id}"]`;

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card(THEIRS)} [data-card-owner]`, { timeout: 15000 });
const checks = await page.$$eval('[data-board-check]', (els) => els.map((e) => ({ id: e.closest('[data-task]').dataset.task, key: e.dataset.boardCheck, source: e.dataset.checkSource, text: e.textContent })));
const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
const ownerSec = await page.$eval(`${card(THEIRS)} [data-card-owner]`, (e) => ({ name: e.dataset.cardOwner, text: e.textContent }));
const theirsClass = await page.$eval(card(THEIRS), (e) => e.className);
const oursClass = await page.$eval(card(OURS), (e) => e.className);
const theirsText = await page.$eval(card(THEIRS), (e) => e.textContent);
const policeLine = await page.$eval('[data-police]', (e) => e.textContent);
const flagChip = !!(await page.$('[data-flag-chip="external"]'));
const bothOwner = await page.$eval(`${card(BOTH)} [data-card-owner]`, (e) => e.dataset.cardOwner);
await shotMain('kanban-external-owner.png');

// Hand OUR card to another developer from the detail: type a name, press the button.
await page.click(`${card(OURS)} [data-card-progress]`);
await page.waitForSelector(`${card(OURS)} [data-owner-input]`, { timeout: 5000 });
const setDisabledBefore = await page.$eval(`${card(OURS)} [data-owner-set]`, (e) => e.disabled);
await page.fill(`${card(OURS)} [data-owner-input]`, 'Bob Kovač');
await page.click(`${card(OURS)} [data-owner-set]`);
await page.waitForSelector(`${card(OURS)} [data-card-owner="Bob Kovač"]`, { timeout: 5000 });
const oursAfter = await page.$eval(`${card(OURS)} [data-board-check]`, (e) => e.dataset.boardCheck);
const pingDisabled = await page.$eval(`${card(OURS)} [data-dispatch]`, (e) => e.disabled);
const detailOwnerRow = await page.$eval(`${card(OURS)} [data-owner-detail]`, (e) => e.textContent);
const policeAfterSet = await page.$eval('[data-police]', (e) => e.textContent);
await shotMain('kanban-external-owner-detail.png');

// Take THEIR card back inline, without opening it: it is judged again at once.
await page.click(`${card(THEIRS)} [data-clear-owner]`);
await page.waitForFunction((sel) => !document.querySelector(`${sel} [data-card-owner]`), card(THEIRS), { timeout: 5000 });
const theirsAfter = await page.$eval(`${card(THEIRS)} [data-board-check]`, (e) => e.dataset.boardCheck);
const detailOpenedByClear = !!(await page.$(`${card(THEIRS)} .kb__detail`));
const theirsClassAfter = await page.$eval(card(THEIRS), (e) => e.className);

await browser.close();
await server.close();

const setCall = calls.find((c) => c.method === 'POST' && c.pathname === `/api/taskgraph/nodes/${OURS}/owner`);
const clearCall = calls.find((c) => c.method === 'DELETE' && c.pathname === `/api/taskgraph/nodes/${THEIRS}/owner`);
const result = {
  externalCardIsExternalNotUnverified: byId[THEIRS]?.key === 'external' && byId[THEIRS].source === 'operator' && /Jane Doe \(Acme\) owns this card — not ours to judge/.test(byId[THEIRS].text),
  ownerSectionNamesTheOwner: ownerSec.name === 'Jane Doe (Acme)' && /Owner/.test(ownerSec.text) && /Jane Doe \(Acme\) \(external\)/.test(ownerSec.text) && /out of our domain/.test(ownerSec.text) && /set by you \(operator\), 3 h ago/.test(ownerSec.text),
  noVerdictWordsOnTheirCard: !/Not verified yet|Needs human|column ahead|claimed/.test(theirsText),
  distinctStyling: /kb__card--external/.test(theirsClass) && !/kb__card--external/.test(oursClass),
  externalWinsOverManual: byId[BOTH]?.key === 'external' && bothOwner === 'Marko' && byId[MANUAL]?.key === 'manual',
  policemanLineCounts: /1 manual · 2 external/.test(policeLine),
  filterChip: flagChip,
  handOverFromDetail: setDisabledBefore === true && !!setCall && setCall.body?.name === 'Bob Kovač' && oursAfter === 'external' && /Bob Kovač \(external\)/.test(detailOwnerRow) && /3 external/.test(policeAfterSet),
  pingDisabledWhileExternal: pingDisabled === true,
  oursAgainInline: !!clearCall && theirsAfter === 'unverified' && !detailOpenedByClear && !/kb__card--external/.test(theirsClassAfter),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ checks, ownerSec, policeLine, policeAfterSet, flagChip, oursAfter, pingDisabled, theirsAfter, calls, pageErrors: errs, result, out: ['kanban-external-owner.png', 'kanban-external-owner-detail.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
