// Evidence shot for fleet task 576ead63 (rename cards): render the Management App's
// Kanban against a MOCKED board whose cards carry cryptic agent-given titles, then do
// what the Operator does — press ✎ on a card, type a readable title, Enter; open the
// card, ✎ describe, type a multi-line description, Save — and screenshot mid-edit and
// after. The mock PATCH mutates the mock board exactly like the harness's
// /api/taskgraph/nodes/{id} (title / note only), so the reload after save shows the new
// text. Asserts: the title and description changed, the id and #ref did NOT, Esc cancels
// without saving, a blank title cannot be saved, and a card drag still sets its drag
// data (drag/drop untouched).
//
//   node client/tests/ui/shot-kanban-rename.mjs        (from the repo root or client/)
// Output: docs/screenshots/kanban-rename-editing.png, kanban-rename-done.png
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
      { handle: 'razvoj2016/birocode#1', key: 'self/birocode', repoId: 'r-web', name: 'birocode', remoteUrl: 'https://github.com/acme/birocode.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't1' },
      { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', lastActor: 'human', runningSince: Date.now() - 60_000, managed: true, docked: true, exists: true, tabId: 't2' },
    ],
  }],
};
const who = (repoId, status) => ({ repoId, sourceId: null, status });
const node = (id, title, status, repoId, extra = {}) => ({ id, title, note: '', status, repoId, sourceId: null, assignees: repoId ? [who(repoId, status)] : [], x: 0, y: 0, createdAt: 1, updatedAt: Date.now() - 300_000, assignedBy: repoId ? 'arch' : null, assignedAt: repoId ? 1 : null, createdBy: 'arch', ...extra });
const board = {
  staleHours: 24, edges: [], machines: [], scratch: '',
  nodes: [
    node('7f3a9c1e2b4d', 'feat/x-7f3a: impl svc+ctl, wire DI, tests (prg)', 'todo', 'r-prg', { note: 'ctx: see thread 2026-09-14 #4; touch KLS/KLC; no DI churn' }),
    node('b2c3d4e5f6a1', 'kb-col-layout: vis+resize+save/restore', 'doing', 'r-web', { dispatchedAt: Date.now() - 900_000, dispatchCount: 1 }),
    node('c3d4e5f6a1b2', 'wd-fleet-col (c96de7ae follow-up)', 'pr-opened', 'r-web', { branch: 'feat/harness-watchdog', pushed: true, prUrl: 'https://github.com/acme/birocode/pull/91', prNumber: 91 }),
    node('d4e5f6a1b2c3', 'ideas→tasks consume (#67)', 'done', 'r-web', { mergeCommit: 'feedfacefeed' }),
  ],
};

// The harness's node PATCH, mocked faithfully for title / note: partial update, a blank
// title refused (404 like the real one), id never touched.
const patches = [];
function patchNode(id, body) {
  const n = board.nodes.find((x) => x.id === id);
  if (!n) return { status: 404, body: { error: 'Unknown node id.' } };
  patches.push({ id, body });
  if (body.title != null) { const t = String(body.title).trim(); if (!t) return { status: 404, body: { error: 'blank title' } }; n.title = t; }
  if (body.note != null) { const t = String(body.note).trim(); n.note = t.length ? t : null; }
  if (body.status != null) n.status = body.status;
  n.updatedAt = Date.now();
  return { status: 200, body: n };
}
function mock(pathname, method, body) {
  const m = /^\/api\/taskgraph\/nodes\/([^/]+)$/.exec(pathname);
  if (m && method === 'PATCH') return patchNode(m[1], body || {});
  switch (pathname) {
    case '/api/auth/check': return { status: 200, body: { authenticated: true } };
    case '/api/arch': return { status: 200, body: { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true } };
    case '/api/arch/fleet/status': return { status: 200, body: fleet };
    case '/api/taskgraph': return { status: 200, body: board };
    case '/api/taskgraph/layout': return { status: 200, body: { layout: null } };
    case '/api/notes': return { status: 200, body: [] };
    case '/api/tasks': return { status: 200, body: { session: { run: null } } };
    default: return { status: 200, body: {} };
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
  const r = mock(pathname, req.method(), body);
  route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const ID = '7f3a9c1e2b4d';
const card = `[data-task="${ID}"]`;
const titleOf = () => page.$eval(`${card} .kb__title-text`, (e) => e.textContent);
const refOf = () => page.$eval(`${card} [data-card-ref]`, (e) => e.dataset.cardRef);
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card} [data-edit-title]`, { timeout: 15000 });
const before = { title: await titleOf(), ref: await refOf() };

// 1) Esc cancels without saving.
await page.click(`${card} [data-edit-title]`);
await page.fill(`${card} [data-title-input]`, 'should not be saved');
await page.keyboard.press('Escape');
const afterEsc = { title: await titleOf(), patches: patches.length, editorGone: !(await page.$(`${card} [data-title-input]`)) };

// 2) A blank title cannot be saved (✓ disabled, Enter does nothing).
await page.click(`${card} [data-edit-title]`);
await page.fill(`${card} [data-title-input]`, '   ');
const blankSaveDisabled = await page.$eval(`${card} [data-title-save]`, (b) => b.disabled);
await page.keyboard.press('Enter');
const blankStillEditing = !!(await page.$(`${card} [data-title-input]`));
const patchesAtBlank = patches.length; // must still be 0: Enter on a blank title sends nothing

// 3) The real rename: type a readable title (screenshot mid-edit), Enter saves.
await page.fill(`${card} [data-title-input]`, 'Export the invoice register as CSV (prg)');
await shotMain('kanban-rename-editing.png');
await page.keyboard.press('Enter');
await page.waitForFunction((sel) => !document.querySelector(`${sel} [data-title-input]`), card, { timeout: 5000 });
await page.waitForFunction((sel) => document.querySelector(`${sel} .kb__title-text`)?.textContent?.startsWith('Export the invoice'), card, { timeout: 5000 });
const afterRename = { title: await titleOf(), ref: await refOf() };

// 4) Open the card, edit the description (multi-line), Save.
await page.click(`${card} .kb__title-text`);
await page.waitForSelector(`${card} [data-edit-note]`, { timeout: 5000 });
const noteBefore = await page.$eval(`${card} [data-note-text]`, (e) => e.textContent).catch(() => null);
await page.click(`${card} [data-edit-note]`);
await page.fill(`${card} [data-note-input]`, 'Export every invoice of the selected year as one CSV.\nColumns: number, date, customer, net, VAT, gross.\nDownload button on the register page.');
await page.click(`${card} [data-note-save]`);
await page.waitForFunction((sel) => !document.querySelector(`${sel} [data-note-input]`), card, { timeout: 5000 });
await page.waitForFunction((sel) => /Columns: number/.test(document.querySelector(`${sel} [data-note-text]`)?.textContent || ''), card, { timeout: 5000 });
const noteAfter = await page.$eval(`${card} [data-note-text]`, (e) => e.textContent);
const idRowAfter = await page.$eval(`${card} .kb__detail .kb__mono`, (e) => e.textContent);
await shotMain('kanban-rename-done.png');

// 5) Reload: the rename + description persisted (the mock store, like the harness's).
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card} .kb__title-text`, { timeout: 15000 });
const afterReload = { title: await titleOf(), ref: await refOf() };

// 6) Drag/drop untouched: a card drag still sets its drag data.
const dragged = await page.evaluate((sel) => {
  const c = document.querySelector(`${sel}`);
  const dt = new DataTransfer();
  c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  return dt.getData('text/task-id');
}, card);

await browser.close();
await server.close();

const checks = {
  escCancelsWithoutSaving: afterEsc.title === before.title && afterEsc.patches === 0 && afterEsc.editorGone,
  blankTitleNotSavable: blankSaveDisabled && blankStillEditing && patchesAtBlank === 0,
  renamed: afterRename.title === 'Export the invoice register as CSV (prg)' && before.title !== afterRename.title,
  refUnchanged: afterRename.ref === before.ref && afterReload.ref === before.ref && before.ref === `#${ID.slice(0, 8)}`,
  idRowUnchanged: idRowAfter.includes(`id ${ID}`),
  described: /Columns: number, date/.test(noteAfter) && noteAfter !== noteBefore,
  patchesWereTitleAndNoteOnly: patches.length === 2 && Object.keys(patches[0].body).join() === 'title' && Object.keys(patches[1].body).join() === 'note' && patches.every((p) => p.id === ID),
  survivesReload: afterReload.title === afterRename.title,
  cardDragIntact: dragged === ID,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ before, afterEsc, blankSaveDisabled, blankStillEditing, patchesAtBlank, afterRename, noteBefore, noteAfter, afterReload, patches, dragged, pageErrors: errs, checks, out: [path.join(OUT, 'kanban-rename-editing.png'), path.join(OUT, 'kanban-rename-done.png')] }, null, 1));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
