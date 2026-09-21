// Evidence shot for openspec arch-chat-tool-calls-history: the arch conversation (Management
// App → Arch tab) over a mocked transcript whose assistant messages carry `toolCalls` — the
// finished turns keep their tool steps on screen — and the History lane over a mocked tool-call
// history of 120 calls: the lane asks for the last 50 by default, says so, keeps every filter,
// and "load all" asks for everything. Screenshots both.
//
//   node client/tests/ui/shot-arch-chat-tool-calls.mjs
// Output: docs/screenshots/arch-chat-tool-calls.png, arch-history-window.png

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
const archState = {
  gateOpen: true, killSwitch: true, loop: null, engine: null, session: { id: 'sess-1' },
  home: { path: 'C:/repos/arch-home', exists: true, commits: [] },
  disallowedTools: [], agents: [], repos: [], scope: { repoIds: [], fleet: [] },
  fleet: { selfLabel: 'spacex', acceptSends: false, acceptUpgrades: false, sources: [] },
  drivenQuietSeconds: 300,
};
const call = (id, name, ok, detail, preview, at) => ({ kind: 'tool', id, name, tool: name.replace(/^mcp__arch__/, ''), status: ok === false ? 'error' : 'done', ok, summary: '', detail, preview, startedAt: at, durationMs: 1200 });
const messages = [
  { role: 'user', text: 'drive repo a to green', timestamp: new Date(now - 600_000).toISOString(), synthetic: false, actor: 'human', toolCalls: null },
  { role: 'assistant', text: 'Sent the task to a; it is on its way.', timestamp: new Date(now - 590_000).toISOString(), synthetic: false, actor: null, toolCalls: [
    call('t1', 'mcp__arch__list_agents', true, '{}', '{"ok":true,"status":"ok","detail":"1 agent"}', now - 595_000),
    call('t2', 'mcp__arch__send_task', true, '{"repoId":"a","text":"make the tests pass"}', '{"ok":true,"status":"sent","detail":"queued on a"}', now - 592_000),
  ] },
  { role: 'user', text: 'and read its reply', timestamp: new Date(now - 300_000).toISOString(), synthetic: false, actor: 'human', toolCalls: null },
  { role: 'assistant', text: 'It could not read the file it wanted.', timestamp: new Date(now - 290_000).toISOString(), synthetic: false, actor: null, toolCalls: [
    call('t3', 'Read', false, '{"file_path":"C:\\\\x.txt"}', 'Read is not allowed', now - 295_000),
  ] },
  { role: 'user', text: 'thanks', timestamp: new Date(now - 100_000).toISOString(), synthetic: false, actor: 'human', toolCalls: null },
  { role: 'assistant', text: 'Welcome.', timestamp: new Date(now - 90_000).toISOString(), synthetic: false, actor: null, toolCalls: null },
];
// 120 historical calls over 30 turns; the endpoint honours ?limit= like the real one.
const TOOLS = ['list_agents', 'send_task', 'read_transcript', 'git_state'];
const allCalls = Array.from({ length: 120 }, (_, i) => ({
  id: `h${i + 1}`, name: `mcp__arch__${TOOLS[i % 4]}`, tool: TOOLS[i % 4], server: 'arch', summary: '',
  input: { repoId: 'a' }, ok: i % 17 === 5 ? false : true, result: i % 17 === 5 ? '{"ok":false,"status":"error","detail":"nope"}' : '{"ok":true,"status":"ok"}',
  resultClipped: false, resultChars: 20, at: new Date(now - (120 - i) * 60_000).toISOString(), resultAt: new Date(now - (120 - i) * 60_000 + 900).toISOString(), durationMs: 900, turn: Math.floor(i / 4) + 1,
}));
const turnsOf = (calls) => [...new Set(calls.map((c) => c.turn))].map((t) => ({ index: t, prompt: `message ${t}`, at: calls.find((c) => c.turn === t).at, actor: 'human', calls: calls.filter((c) => c.turn === t).length }));
const requests = [];
function mock(pathname, search) {
  const q = new URLSearchParams(search);
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return archState;
    case '/api/arch/conversations': return { conversations: [{ id: '@arch', name: 'Arch agent', isDefault: true, createdAt: now, sessionId: 'sess-1' }] };
    case '/api/arch/messages': return { sessionId: 'sess-1', messages, total: messages.length };
    case '/api/arch/tool-calls': {
      const limit = q.has('limit') ? Number(q.get('limit')) : 50;
      requests.push(limit);
      const calls = limit > 0 && limit < allCalls.length ? allCalls.slice(allCalls.length - limit) : allCalls;
      return { sessionId: 'sess-1', calls, turns: turnsOf(calls), total: allCalls.length, truncated: calls.length < allCalls.length, limit };
    }
    case '/api/autopilot/loops': return { loops: [], recipes: [] };
    case '/api/arch/tools': return { tools: [], denied: [] };
    case '/api/arch/tool-calls/preflight': return { checks: [] };
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
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.endsWith('/stream')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }); return; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(u.pathname, u.search)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

// Part 1: the conversation keeps its tool calls after the turns are long finished.
await page.goto(`${base}/manage.html?tab=arch&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.arch__scroll .turn', { timeout: 15000 });
await page.waitForSelector('.turn[data-arch-tool-calls="2"] .step--tool', { timeout: 15000 });
const chat = await page.evaluate(() => ({
  turns: [...document.querySelectorAll('.arch__scroll .turn')].map((t) => ({ calls: t.dataset.archToolCalls, steps: [...t.querySelectorAll('.step--tool .step__name')].map((e) => e.textContent), errors: t.querySelectorAll('.step__icon--error').length, done: t.querySelectorAll('.step__icon--done').length })),
  firstInput: [...document.querySelectorAll('.turn[data-arch-tool-calls="2"] .step__pre')].map((e) => e.textContent).join(' | '),
  liveBlock: !!document.querySelector('.arch__live'),
}));
await shotMain('arch-chat-tool-calls.png');

// Part 2: the History lane loads the last 50 by default, keeps its filters, loads all on request.
await page.click('[data-lane="history"]');
await page.waitForSelector('[data-arch-hist-window]', { timeout: 15000 });
const hist = await page.evaluate(() => ({
  window: document.querySelector('[data-arch-hist-window]')?.textContent,
  loaded: Number(document.querySelector('[data-arch-hist-window]')?.dataset.archHistWindow),
  total: Number(document.querySelector('[data-arch-hist-window]')?.dataset.archHistTotal),
  chips: [...document.querySelectorAll('.arch-hist__chip')].map((c) => c.textContent.trim()),
  errorsOnly: !!document.querySelector('.arch-hist__check input[type=checkbox]'),
  search: !!document.querySelector('.arch-hist__search'),
  sortAndFold: [...document.querySelectorAll('.arch-hist__controls .arch-hist__btn')].map((b) => b.textContent.trim()),
  cards: document.querySelectorAll('.arch-hist__calls > *').length,
}));
await shotMain('arch-history-window.png');
await page.click('[data-arch-hist-all]');
await page.waitForFunction(() => !document.querySelector('[data-arch-hist-total]') || document.querySelector('[data-arch-hist-window]')?.dataset.archHistWindow === '120', null, { timeout: 15000 });
const after = await page.evaluate(() => ({
  window: document.querySelector('[data-arch-hist-window]')?.textContent || null,
  cards: document.querySelectorAll('.arch-hist__calls > *').length,
  allChip: [...document.querySelectorAll('.arch-hist__chip')].map((c) => c.textContent.trim())[0],
}));
await browser.close();
await server.close();

const result = {
  finishedTurnsKeepTheirToolCalls: chat.turns.filter((t) => t.calls === '2').length === 1 && chat.turns.find((t) => t.calls === '2').steps.join(',') === 'mcp__arch__list_agents,mcp__arch__send_task' && chat.turns.find((t) => t.calls === '2').done === 2,
  failedCallShowsAsError: chat.turns.find((t) => t.calls === '1')?.steps.join(',') === 'Read' && chat.turns.find((t) => t.calls === '1').errors === 1,
  callFreeTurnHasNoSteps: chat.turns.filter((t) => t.calls === '0').length === 4,
  stepsCarryTheInput: /"repoId":"a"/.test(chat.firstInput || ''),
  noLiveBlockNeeded: chat.liveBlock === false,
  historyDefaultsToLast50: requests[0] === 50 && hist.loaded === 50 && hist.total === 120 && /last 50/.test(hist.window || '') && /of 120/.test(hist.window || ''),
  historyRendersOnlyFifty: hist.cards === 50 && hist.chips[0] === 'all · 50',
  filtersIntact: hist.errorsOnly && hist.search && hist.sortAndFold.length === 2 && hist.chips.length === 5,
  loadAllAsksForEverything: requests.includes(0) && after.cards === 120 && after.allChip === 'all · 120' && /all 120/.test(after.window || ''),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ chat, hist, after, requests, pageErrors: errs, result, out: ['arch-chat-tool-calls.png', 'arch-history-window.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
