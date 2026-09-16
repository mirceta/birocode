// Evidence shot for fleet task 0a57d282 (Kanban column layout): render the Management
// App's Kanban against a MOCKED board, then do what the Operator does — hide a column,
// drag a column's right-edge handle to widen it, press Save layout — and screenshot the
// controls + board. Then hide another column and press Restore layout, asserting the
// saved visible-set + width come back exactly, and that reloading the page starts from
// the saved layout (the mock persists the PUT like the harness does).
//
//   node client/tests/ui/shot-kanban-layout.mjs        (from the repo root or client/)
// Output: docs/screenshots/kanban-column-layout.png (+ -restored.png)
// Uses the system Chrome (playwright channel) so no browser download is needed.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const fleet = {
  at: Date.now(), hubVersion: '1.0.0+test',
  machines: [{
    machine: 'razvoj2016', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null,
    version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2,
    agents: [
      { handle: 'razvoj2016/birocode#1', key: 'self/birocode', repoId: 'r-web', name: 'birocode', remoteUrl: 'https://github.com/acme/birocode.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: Date.now() - 60_000, managed: true, docked: true, exists: true, tabId: 't1' },
      { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
    ],
  }],
};
const who = (repoId, status) => ({ repoId, sourceId: null, status });
const node = (id, title, status, repoId, extra = {}) => ({ id, title, note: '', status, repoId, sourceId: null, assignees: repoId ? [who(repoId, status)] : [], x: 0, y: 0, createdAt: 1, updatedAt: Date.now() - 300_000, assignedBy: repoId ? 'operator' : null, assignedAt: repoId ? 1 : null, ...extra });
const board = {
  staleHours: 24, edges: [], machines: [], scratch: '',
  nodes: [
    node('a1b2c3d4e5f6', 'Kanban: filterable + resizable columns with save/restore layout', 'doing', 'r-web', { dispatchedAt: Date.now() - 900_000, dispatchCount: 1 }),
    node('b2c3d4e5f6a1', 'Fleet Status: keep-alive column per machine', 'pr-opened', 'r-web', { branch: 'feat/harness-watchdog', pushed: true, prUrl: 'https://github.com/acme/birocode/pull/91', prNumber: 91 }),
    node('c3d4e5f6a1b2', 'Ideas consumed on promotion', 'pr-merged', 'r-web', { branch: 'feat/ideas-consume', prUrl: 'https://github.com/acme/birocode/pull/67', prNumber: 67, mergeCommit: 'deadbeefcafe' }),
    node('d4e5f6a1b2c3', 'Kanban assignee colour chips', 'done', 'r-web', { mergeCommit: 'feedfacefeed' }),
    node('e5f6a1b2c3d4', 'Export the invoice register as CSV', 'todo', 'r-prg'),
    node('f6a1b2c3d4e5', 'Write the release notes for 2.4', 'todo', null),
    node('0a57d282e303', 'Committed on a branch, not yet pushed', 'committed', 'r-prg', { branch: 'feat/csv', pushed: false }),
  ],
};

// The harness's layout store, mocked: GET reads, PUT normalises + persists (per harness).
let savedLayout = null;
const STATUS_KEYS = ['todo', 'doing', 'committed', 'pr-opened', 'pr-merged', 'done'];
function putLayout(body) {
  const wanted = new Set(body.visible || []);
  const widths = {};
  for (const [k, v] of Object.entries(body.widths || {})) if (STATUS_KEYS.includes(k)) widths[k] = Math.max(150, Math.min(900, Math.round(v)));
  savedLayout = { visible: STATUS_KEYS.filter((k) => wanted.has(k)), widths, savedAt: Date.now() };
  return savedLayout;
}
function mock(pathname, method, body) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return method === 'PUT' ? { layout: putLayout(body) } : { layout: savedLayout };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
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
  const req = route.request();
  const { pathname } = new URL(req.url());
  let body = null;
  try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, req.method(), body)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const widthsOf = () => page.$$eval('[data-column]', (els) => Object.fromEntries(els.filter((e) => e.tagName === 'SECTION').map((e) => [e.dataset.column, Number(e.dataset.columnWidth)])));
const visibleOf = () => page.$$eval('section[data-column]', (els) => els.map((e) => e.dataset.column));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-kanban-layout] [data-column-toggle="todo"]', { timeout: 15000 });
await page.waitForSelector('section[data-column="todo"] .kb__card', { timeout: 15000 });
const initialVisible = await visibleOf();
const initialWidths = await widthsOf();

// 1) Hide the PR merged column.
await page.click('[data-column-toggle="pr-merged"]');
// 2) Widen Todo by dragging its right-edge handle +140 px (a real pointer drag).
const handle = await page.$('[data-column-resizer="todo"]');
const hb = await handle.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 70, hb.y + hb.height / 2, { steps: 5 });
await page.mouse.move(hb.x + hb.width / 2 + 140, hb.y + hb.height / 2, { steps: 5 });
await page.mouse.up();
const afterDrag = await widthsOf();
const dirtyBeforeSave = await page.$eval('[data-save-layout]', (b) => b.dataset.dirty);
// 3) Save layout.
await page.click('[data-save-layout]');
await page.waitForSelector('[data-layout-note]', { timeout: 5000 });
const noteAfterSave = await page.$eval('[data-layout-note]', (e) => e.textContent);
await shotMain('kanban-column-layout.png');
const savedVisible = await visibleOf();
const savedWidths = await widthsOf();

// 4) Mess the layout up again (hide Doing, shrink Todo), then Restore layout.
await page.click('[data-column-toggle="doing"]');
const hb2 = await (await page.$('[data-column-resizer="todo"]')).boundingBox();
await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
await page.mouse.down();
await page.mouse.move(hb2.x + hb2.width / 2 - 100, hb2.y + hb2.height / 2, { steps: 5 });
await page.mouse.up();
const messedVisible = await visibleOf();
const messedWidths = await widthsOf();
await page.click('[data-restore-layout]');
const restoredVisible = await visibleOf();
const restoredWidths = await widthsOf();
await shotMain('kanban-column-layout-restored.png');

// 5) Reload: the live layout must start from the saved one.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('section[data-column="todo"] .kb__card', { timeout: 15000 });
const reloadVisible = await visibleOf();
const reloadWidths = await widthsOf();

// Regression guard: card drag/drop still moves a card (the drop handler is untouched).
const dragged = await page.evaluate(() => {
  const card = document.querySelector('section[data-column="todo"] .kb__card');
  const col = document.querySelector('section[data-column="doing"]');
  if (!card || !col) return 'missing';
  const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  col.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
  return dt.getData('text/task-id') ? 'drag-data-set' : 'no-drag-data';
});

await browser.close();
await server.close();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const checks = {
  hidColumn: !savedVisible.includes('pr-merged') && initialVisible.includes('pr-merged'),
  widened: savedWidths.todo > initialWidths.todo,
  dirtyBeforeSave: dirtyBeforeSave === 'true',
  saved: /saved/.test(noteAfterSave),
  messed: !messedVisible.includes('doing') && messedWidths.todo < savedWidths.todo,
  restoredExactly: same(restoredVisible, savedVisible) && same(restoredWidths, savedWidths),
  survivesReload: same(reloadVisible, savedVisible) && same(reloadWidths, savedWidths),
  cardDragIntact: dragged === 'drag-data-set',
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ initialVisible, initialWidths, afterDrag, savedVisible, savedWidths, messedVisible, messedWidths, restoredVisible, restoredWidths, reloadVisible, reloadWidths, dragged, pageErrors: errs, checks, out: [path.join(OUT, 'kanban-column-layout.png'), path.join(OUT, 'kanban-column-layout-restored.png')] }, null, 1));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
