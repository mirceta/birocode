// Evidence shots for openspec one-policeman: the Kanban's 👮 Policeman subtab — the bar (state,
// last / next pass, cards that need you, Run a pass now, reading on/off), the Sweep (one row per
// in-flight card; the 🧠 column), a card's drawer (the words the model was shown, the timeline,
// the answer box → POST nodes/{id}/answer), the History (the journal, quiet minutes folded) and
// What it is — against MOCKED endpoints.
//
//   node client/tests/ui/shot-kanban-policeman-loop.mjs
// Output: docs/screenshots/kanban-policeman-sweep.png, kanban-policeman-card.png, kanban-policeman-history.png, kanban-policeman-explain.png

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
const CSV = 'a1b2c3d4e5f6';
const AUTH = 'b2c3d4e5f6a1';
const RENAME = 'c3d4e5f6a1b2';
const NIGHT = 'd4e5f6a1b2c3';
const RATE = 'e5f6a1b2c3d4';
const flagCsv = { id: CSV, title: 'Export the invoice register as CSV', state: 'stuck', reason: 'asked a question 3 h ago and nobody answered: asks which API key the export should use' };
const flagRate = { id: RATE, title: 'Rate limiter for the public API', state: 'stuck', reason: 'pinged, no PR and no progress for 30 h (window 24 h)' };
const entry = (over) => ({ at: now, lastAt: now, repeats: 1, trigger: 'timer', durationMs: 38, checked: 5, probed: 3, changes: [], traced: [], questions: [], notes: [], cards: 6, honest: 3, dishonest: 1, stuck: 2, manual: 0, flagged: [flagCsv, flagRate], raised: [], cleared: [], error: null, ...over });
const history = [
  entry({ at: now - 20_000 }),
  entry({ at: now - 3 * M, trigger: 'operator', traced: [{ id: AUTH, title: 'Add OAuth login to the admin console', pr: 'PR #42 open', how: 'the assignee on r-prg records branch feat/oauth' }], changes: [{ id: AUTH, title: 'Add OAuth login to the admin console', from: 'doing', to: 'pr-opened', assignee: 'r-prg' }], questions: [{ id: AUTH, title: 'Add OAuth login to the admin console', agent: 'razvoj2016/prg#2', excerpt: 'Opened PR #42 with the OAuth flow; tests pass. Waiting for review.', state: 'waiting-review', summary: 'PR #42 is up; the agent is waiting for review', tokens: 1167, error: null }], durationMs: 2412 }),
  entry({ at: now - 62 * M, lastAt: now - 4 * M, repeats: 59 }),
  entry({ at: now - 63 * M, raised: [flagCsv], durationMs: 51 }),
  entry({ at: now - 5 * H, lastAt: now - 64 * M, repeats: 237, stuck: 1, flagged: [flagRate] }),
  entry({ at: now - 5 * H - M, trigger: 'startup', questions: [{ id: CSV, title: 'Export the invoice register as CSV', agent: 'razvoj2016/prg#1', excerpt: 'Which API key should the export use — production or the sandbox one?', state: 'asked-question', summary: 'asks which API key the export should use; nobody has answered', tokens: 1257, error: null }, { id: NIGHT, title: 'Nightly backup job', agent: 'razvoj2016/ops#1', excerpt: 'Running the migration script now', state: null, summary: null, tokens: 0, error: 'the reader exceeded 75s' }], raised: [flagRate], stuck: 1, flagged: [flagRate], durationMs: 9310 }),
];
const said = (agent, text, at) => ({ agent, text, at, messages: [{ role: 'user', text: 'Please take this card.', at: at - 20 * M }, { role: 'assistant', text, at }] });
const cards = [
  { id: CSV, ref: '#a1b2c3d4', title: 'Export the invoice register as CSV', status: 'doing', verifiedStatus: 'doing', ahead: false, againstSweeps: 0, prUrl: null, prNumber: null, assignees: [{ key: '|r-prg', label: 'razvoj2016/prg#1', status: 'doing' }], pinged: true,
    said: said('razvoj2016/prg#1', 'Register export is drafted. Which API key should the export use — production or the sandbox one? I need it to continue.', now - 3 * H),
    observation: { at: now - 3 * H, by: 'policeman', state: 'asked-question', summary: 'asks which API key the export should use; nobody has answered' },
    needsHuman: { at: now - 63 * M, by: 'policeman', reason: flagCsv.reason, answer: null, answeredAt: null }, warning: null, thisPass: { moved: [], traced: [], asked: [], raised: false, cleared: false } },
  { id: AUTH, ref: '#b2c3d4e5', title: 'Add OAuth login to the admin console', status: 'pr-opened', verifiedStatus: 'pr-opened', ahead: false, againstSweeps: 0, prUrl: 'https://github.com/acme/prg/pull/42', prNumber: 42, assignees: [{ key: '|r-prg', label: 'razvoj2016/prg#2', status: 'pr-opened' }], pinged: true,
    said: said('razvoj2016/prg#2', 'Opened PR #42 with the OAuth flow and the callback route; tests pass. Waiting for review.', now - 25 * M),
    observation: { at: now - 3 * M, by: 'policeman', state: 'waiting-review', summary: 'PR #42 is up; the agent is waiting for review' }, needsHuman: null, warning: null,
    thisPass: { moved: [], traced: [], asked: [], raised: false, cleared: false } },
  { id: RENAME, ref: '#c3d4e5f6', title: 'Rename the settings page', status: 'pr-opened', verifiedStatus: 'doing', ahead: true, againstSweeps: 1, prUrl: null, prNumber: null, assignees: [{ key: 'kiki|r-web', label: 'kiki-laptop/web#1', status: 'pr-opened' }], pinged: true,
    said: said('kiki-laptop/web#1', 'Renamed the page and the route. I will push once the snapshot tests are updated.', now - 2 * H),
    observation: { at: now - 2 * H, by: 'policeman', state: 'working', summary: 'renamed the page and the route; pushes after the snapshot tests' }, needsHuman: null, warning: 'marked PR open, but no pull request has been found on GitHub yet',
    thisPass: { moved: [], traced: [], asked: [], raised: false, cleared: false } },
  { id: NIGHT, ref: '#d4e5f6a1', title: 'Nightly backup job', status: 'doing', verifiedStatus: 'doing', ahead: false, againstSweeps: 0, prUrl: null, prNumber: null, assignees: [{ key: '|r-ops', label: 'razvoj2016/ops#1', status: 'doing' }], pinged: true,
    said: said('razvoj2016/ops#1', 'Running the migration script against the staging copy now; will report in a few minutes.', now - 6 * M),
    observation: null, needsHuman: null, warning: null, thisPass: { moved: [], traced: [], asked: [{ state: null, summary: null, tokens: 0, error: 'the reader exceeded 75s' }], raised: false, cleared: false } },
  { id: RATE, ref: '#e5f6a1b2', title: 'Rate limiter for the public API', status: 'doing', verifiedStatus: 'doing', ahead: false, againstSweeps: 0, prUrl: null, prNumber: null, assignees: [{ key: 'kiki|r-api', label: 'kiki-laptop/api#1', status: 'doing' }], pinged: true,
    said: said('kiki-laptop/api#1', 'Starting on the token bucket.', now - 30 * H),
    observation: { at: now - 30 * H, by: 'policeman', state: 'working', summary: 'started on the token bucket' },
    needsHuman: { at: now - 5 * H, by: 'policeman', reason: flagRate.reason, answer: null, answeredAt: null }, warning: null, thisPass: { moved: [], traced: [], asked: [], raised: false, cleared: false } },
];
let answered = null;
const status = (card) => ({
  intervalSeconds: 60, startedAt: now - 6 * H, lastAt: now - 20_000, nextDueAt: now + 40_000, running: false, passes: 301, now,
  settings: { enabled: true, model: 'haiku', tail: 4, maxQuestionsPerPass: 8 }, staleHours: 24,
  integrity: { checkedAt: now - 20_000, cards: 6, honest: 3, dishonest: 1, stuck: 2, manual: 0, flagged: [flagCsv, flagRate, { id: RENAME, title: 'Rename the settings page', state: 'dishonest', reason: 'column ahead of reality' }] },
  last: history[0],
  cards: cards.map((c) => (answered && c.id === answered.id ? { ...c, needsHuman: { ...c.needsHuman, answer: answered.text, answeredAt: now } } : c)),
  card: card || null,
  history: card ? history.filter((e) => e.changes.some((c) => c.id === card) || e.traced.some((t) => t.id === card) || e.questions.some((q) => q.id === card) || e.raised.some((f) => f.id === card) || e.cleared.some((f) => f.id === card) || e.flagged.some((f) => f.id === card)) : history,
  cardsSeen: [{ id: AUTH, title: 'Add OAuth login to the admin console' }, { id: CSV, title: 'Export the invoice register as CSV' }, { id: NIGHT, title: 'Nightly backup job' }],
});
const board = { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: null, nodes: [], integrity: status().integrity };

function mock(pathname, search, method, body) {
  const q = new URLSearchParams(search);
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/taskgraph': return board;
    case '/api/taskgraph/policeman': return status(q.get('card'));
    case '/api/taskgraph/policeman/settings': return { settings: { enabled: false, model: 'haiku', tail: 4, maxQuestionsPerPass: 8 } };
    case '/api/taskgraph/verify': return { checked: 5, probed: 3, at: now, changes: [], notes: [] };
    case `/api/taskgraph/nodes/${CSV}/answer`: answered = { id: CSV, text: body?.text }; return { node: {}, sent: [{ assignee: 'razvoj2016/prg#1', ok: true, status: 'sent', detail: 'ok' }] };
    case '/api/taskgraph/layout': return { layout: null };
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
  localStorage.removeItem('manageapp.policemanView');
});
const calls = { verify: 0, settings: [], answer: [] };
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname, search } = new URL(req.url());
  let body = null;
  try { body = req.postDataJSON(); } catch { body = null; }
  if (pathname === '/api/taskgraph/verify' && req.method() === 'POST') calls.verify++;
  if (pathname === '/api/taskgraph/policeman/settings') calls.settings.push(body);
  if (pathname.endsWith('/answer')) calls.answer.push(body);
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, search, req.method(), body)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-kanban-subtabs]', { timeout: 15000 });
const subtabs = await page.$$eval('[data-kanban-sub]', (els) => els.map((e) => e.dataset.kanbanSub));

await page.click('[data-kanban-sub="policeman"]');
await page.waitForSelector('[data-policeman-sweep] [data-policeman-card]', { timeout: 15000 });
const state = await page.$eval('[data-policeman-state]', (e) => [e.dataset.policemanState, e.textContent]);
const meta = await page.$eval('[data-policeman-meta]', (e) => e.textContent);
const verdict = await page.$eval('[data-policeman-verdict]', (e) => e.textContent);
const rows = await page.$$eval('[data-policeman-card]', (els) => els.map((e) => ({ id: e.dataset.policemanCard, flag: e.classList.contains('pl__row--flag'), text: e.textContent })));
const flaggedNow = await page.$eval('[data-policeman-flagged-now]', (e) => e.textContent);
await shotMain('kanban-policeman-sweep.png');

// Run a pass now → POST /taskgraph/verify; Stop reading → POST settings {enabled:false}.
await page.click('[data-policeman-run]');
await page.waitForTimeout(200);
await page.click('[data-policeman-toggle-reading]');
await page.waitForTimeout(200);

// A card: its drawer — the words, the timeline, the answer box; answering posts and the flag shows the answer.
await page.click(`[data-policeman-card="${CSV}"]`);
await page.waitForSelector(`[data-policeman-drawer="${CSV}"] [data-policeman-timeline-entry]`, { timeout: 10000 });
const drawer = await page.evaluate((id) => {
  const d = document.querySelector(`[data-policeman-drawer="${id}"]`);
  return { messages: d.querySelectorAll('[data-policeman-messages] li').length, timeline: d.querySelectorAll('[data-policeman-timeline-entry]').length, answerBox: !!d.querySelector('[data-policeman-answer-box]'), text: d.textContent };
}, CSV);
await page.fill('[data-policeman-answer-text]', 'Use the sandbox key; the production one is only for the deploy job.');
await shotMain('kanban-policeman-card.png');
await page.click('[data-policeman-answer]');
await page.waitForFunction(() => /answered — waiting for the agent/.test(document.querySelector('[data-policeman-sweep]').textContent), null, { timeout: 10000 });
const afterAnswer = await page.$eval(`[data-policeman-card="${CSV}"]`, (e) => e.textContent);

// History: every pass, folded runs, the question rows, the failed question; then one card's timeline through the picker.
await page.click('[data-policeman-view="history"]');
await page.waitForSelector('[data-policeman-history] [data-policeman-entry]', { timeout: 10000 });
const hist = await page.$$eval('[data-policeman-entry]', (els) => els.map((e) => ({ trigger: e.dataset.policemanTrigger, repeats: Number(e.dataset.policemanRepeats), loud: e.classList.contains('pl__row--loud'), text: e.textContent })));
const questions = await page.$$eval('[data-policeman-question]', (els) => els.map((e) => e.dataset.policemanQuestion));
await shotMain('kanban-policeman-history.png');
await page.selectOption('[data-policeman-history-card]', AUTH);
await page.waitForFunction((n) => document.querySelectorAll('[data-policeman-entry]').length === n, 1, { timeout: 10000 });
await page.selectOption('[data-policeman-history-card]', '');
await page.waitForFunction((n) => document.querySelectorAll('[data-policeman-entry]').length === n, history.length, { timeout: 10000 });

// What it is.
await page.click('[data-policeman-view="explain"]');
await page.waitForSelector('[data-policeman-explainer] [data-policeman-before]', { timeout: 10000 });
const explain = {
  pass: await page.$$eval('[data-policeman-pass] li', (els) => els.length),
  model: await page.$$eval('[data-policeman-pass] li.pl__step--model', (els) => els.length),
  writes: await page.$$eval('[data-policeman-writes] tr', (els) => els.length),
  never: await page.$$eval('[data-policeman-never] tr', (els) => els.length),
  before: await page.$$eval('[data-policeman-before] tr', (els) => els.length),
};
await shotMain('kanban-policeman-explain.png');
await browser.close();
await server.close();

const ok = subtabs.join(',') === 'board,policeman'
  && state[0] === 'on' && /every 60 s · 301 passes since start/.test(state[1])
  && /last pass \d+ s ago \(the minute timer\) · next in \d+ s · 2 cards need you/.test(meta)
  && /3 honest · 1 not verified yet · 2 need human · 0 manual/.test(verdict)
  && rows.length === 5 && rows[0].flag && !rows[1].flag && rows[4].flag
  && /Asked a question/.test(rows[0].text) && /needs you/.test(rows[0].text)
  && /Waiting for review/.test(rows[1].text) && /PR #42/.test(rows[1].text)
  && /column ahead of the facts/.test(rows[2].text)
  && /not read yet/.test(rows[3].text) && /no usable answer — the reader exceeded 75s/.test(rows[3].text)
  && /flagged now: #a1b2c3d4 🛑 stuck · #e5f6a1b2 🛑 stuck · #c3d4e5f6 ⚠️ not verified yet/.test(flaggedNow)
  && calls.verify === 1 && calls.settings.length === 1 && calls.settings[0].enabled === false
  && drawer.messages === 2 && drawer.timeline === 5 && drawer.answerBox && /what the model was shown \(razvoj2016\/prg#1\)/.test(drawer.text)
  && calls.answer.length === 1 && /sandbox key/.test(calls.answer[0].text) && /answered — waiting for the agent/.test(afterAnswer)
  && hist.length === history.length && hist[1].trigger === 'operator' && hist[1].loud && /traced 1 PR · moved 1 card · asked 🧠 1 \(1,167 tokens\)/.test(hist[1].text)
  && hist[2].repeats === 59 && /59 quiet passes/.test(hist[2].text)
  && hist[5].trigger === 'startup' && /asked 🧠 2 \(1,257 tokens\) · raised 1 🆘/.test(hist[5].text) && /no usable answer: the reader exceeded 75s/.test(hist[5].text)
  && questions.length === 3
  && explain.pass === 7 && explain.model === 1 && explain.writes === 4 && explain.never === 5 && explain.before === 3;
console.log(JSON.stringify({ subtabs, state, meta, verdict, rows: rows.map((r) => [r.id.slice(0, 4), r.flag]), flaggedNow, calls, drawer: { ...drawer, text: drawer.text.length }, afterAnswer: /answered/.test(afterAnswer), hist: hist.map((h) => [h.trigger, h.repeats, h.loud]), questions, explain, errs, ok }));
process.exit(errs.length === 0 && ok ? 0 : 1);
