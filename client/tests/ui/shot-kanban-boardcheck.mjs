// Evidence shots for openspec board-check-provenance: the Kanban's 🔎 Board check subtab —
// the bar (what it is, state, last / next pass, Run a pass now), the verdict, the journal
// of passes with quiet minutes folded into runs, a card's own timeline through the picker,
// and the "what it is" explainer with the two writers side by side — against MOCKED endpoints.
//
//   node client/tests/ui/shot-kanban-boardcheck.mjs
// Output: docs/screenshots/kanban-boardcheck-history.png, kanban-boardcheck-card.png, kanban-boardcheck-explain.png

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
const M = 60_000;
const H = 60 * M;
const CSV = 'c3d4e5f6a1b2';
const AUTH = 'd4e5f6a1b2c3';
const flagCsv = { id: CSV, title: 'Export the invoice register as CSV', state: 'stuck', reason: 'pinged, no PR and no progress for 30 h (window 24 h)' };
const entry = (over) => ({ at: now, lastAt: now, repeats: 1, trigger: 'timer', durationMs: 38, checked: 5, probed: 3, changes: [], notes: [], cards: 7, honest: 5, dishonest: 1, stuck: 1, manual: 0, flagged: [flagCsv], raised: [], cleared: [], error: null, ...over });
const history = [
  entry({ at: now - 20_000 }),
  entry({ at: now - 3 * M, trigger: 'policeman', changes: [{ id: AUTH, title: 'Add OAuth login to the admin console', from: 'doing', to: 'pr-opened', assignee: 'r-prg' }], durationMs: 412 }),
  entry({ at: now - 62 * M, lastAt: now - 4 * M, repeats: 59 }),
  entry({ at: now - 63 * M, raised: [flagCsv], durationMs: 51 }),
  entry({ at: now - 5 * H, lastAt: now - 64 * M, repeats: 237, honest: 6, stuck: 0, flagged: [] }),
  entry({ at: now - 5 * H - M, trigger: 'operator', changes: [{ id: AUTH, title: 'Add OAuth login to the admin console', from: 'todo', to: 'doing', assignee: 'r-prg' }, { id: CSV, title: 'Export the invoice register as CSV', from: 'committed', to: 'doing' }], honest: 6, stuck: 0, flagged: [], durationMs: 388 }),
  entry({ at: now - 6 * H, trigger: 'startup', error: 'gh: not logged in — PR facts skipped this pass', honest: 0, dishonest: 0, stuck: 0, cards: 0, flagged: [], checked: 0, probed: 0, durationMs: 9 }),
];
const status = (card) => ({
  intervalSeconds: 60, startedAt: now - 6 * H, lastAt: now - 20_000, nextDueAt: now + 40_000, running: false, passes: 301, staleHours: 24,
  integrity: { checkedAt: now - 20_000, cards: 7, honest: 5, dishonest: 1, stuck: 1, manual: 0, flagged: [flagCsv, { id: 'e5f6a1b2c3d4', title: 'Rename the settings page', state: 'dishonest', reason: 'column ahead of reality — marked PR open, but no pull request has been found on GitHub yet' }] },
  last: history[0],
  card: card || null,
  history: card ? history.filter((e) => e.changes.some((c) => c.id === card) || e.raised.some((f) => f.id === card) || e.cleared.some((f) => f.id === card) || e.flagged.some((f) => f.id === card)) : history,
  cards: [{ id: AUTH, title: 'Add OAuth login to the admin console' }, { id: CSV, title: 'Export the invoice register as CSV' }],
});
const board = { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: null, nodes: [], integrity: status().integrity };

function mock(pathname, search, method) {
  const q = new URLSearchParams(search);
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/taskgraph': return board;
    case '/api/taskgraph/boardcheck': return status(q.get('card'));
    case '/api/taskgraph/verify': return { checked: 5, probed: 3, at: now, changes: [], notes: [] };
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/arch/policeman': return { exists: false, enabled: false, sessions: [], intervalSeconds: 300, contextCapTokens: 400000, allowedTools: [] };
    case '/api/arch/fleet/status': return { at: now, machines: [] };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return method === 'GET' ? {} : { ok: true };
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1380, height: 980 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.kanbanSub', 'board');
  localStorage.removeItem('manageapp.boardCheckView');
});
let verifyCalls = 0;
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname, search } = new URL(req.url());
  if (pathname === '/api/taskgraph/verify' && req.method() === 'POST') verifyCalls++;
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, search, req.method())) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-kanban-subtabs]', { timeout: 15000 });
const subtabs = await page.$$eval('[data-kanban-sub]', (els) => els.map((e) => e.dataset.kanbanSub));
const headerGlyph = await page.$eval('[data-police]', (e) => e.textContent.trim().slice(0, 2));

await page.click('[data-kanban-sub="boardcheck"]');
await page.waitForSelector('[data-boardcheck-history] [data-boardcheck-entry]', { timeout: 15000 });
const state = await page.$eval('[data-boardcheck-state]', (e) => [e.dataset.boardcheckState, e.textContent]);
const meta = await page.$eval('[data-boardcheck-meta]', (e) => e.textContent);
const verdict = await page.$eval('[data-boardcheck-verdict]', (e) => e.textContent);
const last = await page.$eval('[data-boardcheck-last]', (e) => e.textContent);
const rows = await page.$$eval('[data-boardcheck-entry]', (els) => els.map((e) => ({ trigger: e.dataset.boardcheckTrigger, repeats: Number(e.dataset.boardcheckRepeats), err: e.classList.contains('bc__row--err'), loud: e.classList.contains('bc__row--loud'), text: e.textContent })));
const moves = await page.$$eval('[data-boardcheck-move]', (els) => els.map((e) => e.dataset.boardcheckMove));
const raised = await page.$$eval('[data-boardcheck-flag][data-boardcheck-flag-verb="raised"]', (els) => els.map((e) => e.dataset.boardcheckFlag));
const flaggedNow = await page.$eval('[data-boardcheck-flagged-now]', (e) => e.textContent);
await shotMain('kanban-boardcheck-history.png');

// Run a pass now → POST /taskgraph/verify.
await page.click('[data-boardcheck-run]');
await page.waitForFunction(() => true);
await page.waitForTimeout(300);

// A card's own timeline through the picker.
await page.selectOption('[data-boardcheck-card]', AUTH);
await page.waitForFunction((n) => document.querySelectorAll('[data-boardcheck-entry]').length === n, 2, { timeout: 10000 });
const cardRows = await page.$$eval('[data-boardcheck-entry]', (els) => els.map((e) => e.dataset.boardcheckTrigger));
await shotMain('kanban-boardcheck-card.png');
await page.selectOption('[data-boardcheck-card]', '');
await page.waitForFunction((n) => document.querySelectorAll('[data-boardcheck-entry]').length === n, history.length, { timeout: 10000 });

// What it is: the loop in words, what it writes, what it never does, the two writers side by side.
await page.click('[data-boardcheck-view="explain"]');
await page.waitForSelector('[data-boardcheck-explainer] [data-boardcheck-writers]', { timeout: 10000 });
const explain = {
  pass: await page.$$eval('[data-boardcheck-pass] li', (els) => els.length),
  writes: await page.$$eval('[data-boardcheck-writes] tr', (els) => els.length),
  never: await page.$$eval('[data-boardcheck-never] tr', (els) => els.length),
  writers: await page.$$eval('[data-boardcheck-writers] tbody tr', (els) => els.length),
  head: await page.$$eval('[data-boardcheck-writers] thead th', (els) => els.map((e) => e.textContent)),
  text: await page.$eval('[data-boardcheck-explainer]', (e) => e.textContent),
};
await shotMain('kanban-boardcheck-explain.png');
await browser.close();
await server.close();

const ok = subtabs.join(',') === 'board,boardcheck,policeman'
  && headerGlyph.startsWith('🔎')
  && state[0] === 'on' && /every 60 s · 301 passes since start/.test(state[1])
  && /last pass \d+ s ago \(the minute timer\) · next in \d+ s · running since/.test(meta)
  && /5 honest · 1 not verified yet · 1 need human · 0 manual/.test(verdict)
  && /quiet — nothing to move/.test(last)
  && rows.length === history.length
  && rows[1].trigger === 'policeman' && rows[1].loud && /moved 1 card/.test(rows[1].text)
  && rows[2].repeats === 59 && /59 quiet passes/.test(rows[2].text) && /→/.test(rows[2].text)
  && rows[3].loud && /raised 1 🆘/.test(rows[3].text)
  && rows[5].trigger === 'operator' && /moved 2 cards/.test(rows[5].text)
  && rows[6].trigger === 'startup' && rows[6].err && /failed: gh: not logged in/.test(rows[6].text)
  && moves.length === 3 && raised.length === 1 && raised[0] === CSV
  && /flagged now: #c3d4e5f6 🛑 stuck · #e5f6a1b2 ⚠️ not verified yet/.test(flaggedNow)
  && verifyCalls === 1
  && cardRows.length === 2 && cardRows.join(',') === 'policeman,operator'
  && explain.pass === 5 && explain.writes === 4 && explain.never === 5 && explain.writers === 6
  && explain.head.join('|') === '|🔎 Board check|👮 Policeman'
  && /Harness code — not a model, not a prompt/.test(explain.text) && /one-policeman/.test(explain.text);
console.log(JSON.stringify({ subtabs, headerGlyph, state, meta, verdict, last, rows: rows.map((r) => [r.trigger, r.repeats, r.loud, r.err]), moves, raised, flaggedNow, verifyCalls, cardRows, explain: { ...explain, text: explain.text.length }, errs, ok }));
process.exit(errs.length === 0 && ok ? 0 : 1);
