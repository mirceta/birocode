// Evidence shots for openspec kanban-policeman-conversation: the Kanban's 👮 Policeman
// subtab — the control strip (state, interval, context vs cap, session number, Start /
// Stop / Check now / Roll over, settings, live verdict), the sessions strip (provenance
// across rollovers) and the embedded arch conversation (chat + tool-call history) —
// rendered against MOCKED harness endpoints, then a past session's tool calls.
//
//   node client/tests/ui/shot-kanban-policeman-conversation.mjs
// Output: docs/screenshots/kanban-policeman-subtab.png, kanban-policeman-past-session.png

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
const CONV = '@arch:policeman';
const SESS_A = 'a1f3c9d2-8e77-4b1a-9c0d-0f1e2d3c4b5a';
const SESS_B = 'b7e2d1c0-4a55-4c9e-8f3b-6a7b8c9d0e1f';

const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'razvoj2016', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 1, agents: [
  { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
] }] };
const board = { staleHours: 24, edges: [], machines: [], scratch: '', goal: 'Ship the invoice CSV export by Friday; nothing on the board may claim more than the facts show.', goalUpdatedAt: now - 2 * H,
  nodes: [{ id: 'c3d4e5f6a1b2', title: 'Export the invoice register as CSV', note: '', status: 'doing', repoId: 'r-prg', sourceId: null, assignees: [{ repoId: 'r-prg', sourceId: null, status: 'doing', dispatchedAt: now - 30 * H, updatedAt: now - 30 * H }], x: 0, y: 0, createdAt: 1, updatedAt: now - 30 * H, createdBy: 'arch', dispatchedAt: now - 30 * H, dispatchCount: 1, needsHuman: { at: now - 6 * 60_000, by: 'policeman', reason: 'pinged, no PR and no progress for 30 h (window 24 h)' } }],
  integrity: { checkedAt: now - 20_000, cards: 1, honest: 0, dishonest: 0, stuck: 1, manual: 0, flagged: [{ id: 'c3d4e5f6a1b2', title: 'Export the invoice register as CSV', state: 'stuck', reason: 'pinged, no PR and no progress for 30 h (window 24 h)' }] } };

const policeman = {
  conversationId: CONV, name: '👮 Policeman', exists: true, sessionId: SESS_B, enabled: true, intervalSeconds: 300, contextCapTokens: 400000, maxTurnsPerSession: 400,
  lastContextTokens: 187_400, turnsThisSession: 12, lastTurnAt: now - 4 * 60_000, rollovers: 1, restarts: 0, lastRolloverAt: now - 3 * H, handoverPending: false,
  sessions: [
    { sessionId: SESS_A, startedAt: now - 26 * H, endedAt: now - 3 * H, endedBecause: 'its context reached 401,220 tokens (cap 400,000)', contextTokens: 401_220, turns: 288 },
    { sessionId: SESS_B, startedAt: now - 3 * H, endedAt: null, endedBecause: null, contextTokens: 187_400, turns: 12 },
  ],
  loop: { kind: 'recipe', active: true, status: 'looping', iterationsDone: 12, maxIterations: 100, lastSentAt: now - 4 * 60_000, stopReason: null, stopDetail: null, armedAt: now - 3 * H },
  running: false,
  verdict: { checkedAt: now - 20_000, cards: 1, honest: 0, dishonest: 0, stuck: 1, manual: 0, flagged: board.integrity.flagged },
  boardGoal: board.goal,
  prompt: 'You are the board POLICEMAN — the standing checker that keeps the fleet Kanban HONEST …\n\n1. Call board_integrity. …\n2. Call list_tasks …\n3. Act ONLY by flagging …\n4. Answer with a short verdict …',
  allowedTools: ['board_integrity', 'clear_needs_human', 'flag_needs_human', 'git_state', 'list_agents', 'list_arch_goals', 'list_ideas', 'list_loops', 'list_machines', 'list_tasks', 'read_transcript', 'recall', 'remember'],
};

const archState = {
  gateOpen: true, killSwitch: true, machine: 'razvoj2016', selfLabel: 'razvoj2016',
  conversation: { id: CONV, name: '👮 Policeman', isDefault: false, createdAt: now - 26 * H, sessionId: SESS_B, policeman: true },
  loop: { kind: 'recipe', active: true, status: 'looping', mode: 'drive', iterationsDone: 12, maxIterations: 100, stopReason: null, stopDetail: null, prompt: policeman.prompt, sentinel: 'POLICEMAN_RETIRED' },
  engine: { decision: 'idle', label: null, reason: 'waiting for a managed repo turn · re-prompt in 0:52' },
  home: { path: 'C:\\Users\\Kiki\\Desktop\\playground\\arch-home', exists: true },
  managed: ['r-prg'], fleetManaged: [], repos: [{ id: 'r-prg', name: 'prg' }], agents: [{ repoId: 'r-prg', name: 'prg', machine: 'self', handle: 'razvoj2016/prg#1', availability: 'claimed', managed: true }],
  fleet: { sources: [], acceptSends: true, acceptUpgrades: false }, goals: [], goal: null, busy: false, recipes: [], sessionId: SESS_B, drivenQuietSeconds: 300, claimWindowMinutes: 120,
};
const messagesB = { sessionId: SESS_B, messages: [
  { role: 'user', text: '[harness: context rolled over — this is session #2 of the policeman conversation; the previous session a1f3c9d2 was cut because its context reached 401,220 tokens (cap 400,000). Its transcript and tool calls stay in History. …]\nBoard now: 1 cards — 0 honest · 0 dishonest · 1 stuck · 0 manual.\n- stuck: Export the invoice register as CSV — pinged, no PR and no progress for 30 h (window 24 h)\n[Your standing prompt follows.]\n\nYou are the board POLICEMAN — the standing checker that keeps the fleet Kanban HONEST …', actor: 'loop' },
  { role: 'assistant', text: 'Verdict: 0 honest · 0 dishonest · 1 need human · 0 manual.\n- #c3d4e5f6 Export the invoice register as CSV — razvoj2016/prg#1 was pinged 30 h ago, has no branch and no PR; read_transcript shows its last reply asked for a production credential. Flag stands (raised by me in session #1). The Operator should provide the credential or reassign; nothing for the arch to dispatch.\nNo change since my last pass.' },
  { role: 'user', text: 'Why is the CSV card still flagged?', actor: 'human' },
  { role: 'assistant', text: 'Because nothing changed on the facts: git_state on prg shows no task branch and GitHub has no PR from that agent; its transcript ends with "I need the production API key to continue". The stamp is mine (policeman) and I will clear it the moment a branch with commits or a PR appears. If you want it handled by hand, flip the card to manual.' },
] };
const callsFor = (sid) => ({ sessionId: sid, turns: [
  { index: 1, prompt: sid === SESS_A ? 'You are the board POLICEMAN — …' : '[harness: context rolled over — …] You are the board POLICEMAN — …', at: new Date(now - (sid === SESS_A ? 25 : 2.5) * H).toISOString(), actor: 'loop', calls: 3 },
], calls: [
  { id: 'c1', name: 'mcp__arch__board_integrity', tool: 'board_integrity', server: 'arch', summary: 'board_integrity', input: {}, ok: true, result: '{"ok":true,"status":"ok","detail":"1 card(s): 0 honest, 0 dishonest, 1 stuck, 0 manual; 1 carry a human request"}', resultClipped: false, resultChars: 120, at: new Date(now - 4 * 60_000).toISOString(), resultAt: new Date(now - 4 * 60_000 + 800).toISOString(), durationMs: 800, turn: 1 },
  { id: 'c2', name: 'mcp__arch__read_transcript', tool: 'read_transcript', server: 'arch', summary: 'read_transcript prg', input: { repoId: 'r-prg', tail: 4 }, ok: true, result: '{"ok":true,"status":"ok","data":{"messages":[{"role":"assistant","text":"I need the production API key to continue."}]}}', resultClipped: false, resultChars: 140, at: new Date(now - 4 * 60_000 + 900).toISOString(), resultAt: new Date(now - 4 * 60_000 + 1400).toISOString(), durationMs: 500, turn: 1 },
  { id: 'c3', name: 'mcp__arch__' + (sid === SESS_A ? 'flag_needs_human' : 'dispatch_task'), tool: sid === SESS_A ? 'flag_needs_human' : 'dispatch_task', server: 'arch', summary: sid === SESS_A ? 'flag_needs_human #c3d4e5f6' : 'dispatch_task #c3d4e5f6', input: { id: '#c3d4e5f6', reason: 'pinged 30 h ago, no branch, no PR; asked for a credential' }, ok: sid === SESS_A, result: sid === SESS_A ? '{"ok":true,"status":"flagged","detail":"task #c3d4e5f6 \\"Export the invoice register as CSV\\": human assistance requested — pinged 30 h ago, no branch, no PR; asked for a credential"}' : '{"ok":false,"status":"policeman-observe-only","detail":"dispatch_task is not available to the policeman: it observes, verifies and flags only (board_integrity, flag_needs_human, clear_needs_human, list_*, read_transcript, git_state, recall). Say what should happen; the Operator or the arch acts on it."}', resultClipped: false, resultChars: 200, at: new Date(now - 4 * 60_000 + 1500).toISOString(), resultAt: new Date(now - 4 * 60_000 + 1700).toISOString(), durationMs: 200, turn: 1 },
] });

function mock(pathname, search, method) {
  const q = new URLSearchParams(search);
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return q.get('conv') === CONV ? archState : { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true, conversation: { id: '@arch', name: 'Arch agent', isDefault: true }, repos: [], agents: [], managed: [], goals: [] };
    case '/api/arch/conversations': return { conversations: [{ id: '@arch', name: 'Arch agent', isDefault: true, policeman: false }, { id: CONV, name: '👮 Policeman', isDefault: false, policeman: true, loop: { kind: 'recipe', active: true, status: 'looping' } }] };
    case '/api/arch/policeman': return policeman;
    case '/api/arch/messages': return messagesB;
    case '/api/arch/tool-calls': return callsFor(q.get('sessionId') || SESS_B);
    case '/api/arch/fleet/status': return fleet;
    case '/api/arch/tools': return { tools: [], denied: [] };
    case '/api/autopilot/loops': return { loops: [{ repoId: CONV, kind: 'recipe', active: true, status: 'looping', mode: 'drive', iterationsDone: 12, maxIterations: 100 }] };
    case '/api/autopilot/recipes': return { recipes: [] };
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: null };
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
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname, search } = new URL(req.url());
  if (pathname === '/api/arch/stream') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No arch run yet.' }) });
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, search, req.method())) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-kanban-subtabs]', { timeout: 15000 });
const boardFirst = !!(await page.$('[data-kanban]'));
const stripTabs = await page.$$eval('.mg__tabs .mg__tab, .mg__tab', (els) => els.map((e) => e.textContent.trim()));

await page.click('[data-kanban-sub="policeman"]');
await page.waitForSelector('[data-policeman-bar]', { timeout: 15000 });
await page.waitForSelector('[data-policeman-sessions] [data-policeman-session]', { timeout: 15000 });
await page.waitForSelector('[data-conversation-head]', { timeout: 15000 });
await page.waitForFunction(() => document.querySelectorAll('.turn').length >= 2, null, { timeout: 15000 }).catch(() => {});
const state = await page.$eval('[data-policeman-state]', (e) => [e.dataset.policemanState, e.textContent]);
const meta = await page.$eval('[data-policeman-meta]', (e) => e.textContent);
const verdict = await page.$eval('[data-policeman-verdict]', (e) => e.textContent);
const sessionChips = await page.$$eval('[data-policeman-session]', (els) => els.map((e) => e.textContent));
const convName = await page.$eval('[data-conv-name]', (e) => [e.value || e.placeholder, e.readOnly]);
const removeShown = !!(await page.$('[data-remove-conv]'));
const turns = await page.$$eval('.turn', (els) => els.length);
const composerPlaceholder = await page.$eval('.arch__composer textarea', (e) => e.placeholder);
await page.click('[data-policeman-show-prompt]');
await page.waitForSelector('[data-policeman-prompt]', { timeout: 5000 });
await shotMain('kanban-policeman-subtab.png');

// The past session (provenance): its tool calls, incl. the flag it raised.
await page.click(`[data-policeman-session="${SESS_A}"]`);
await page.waitForSelector('[data-policeman-past]', { timeout: 10000 });
await page.waitForFunction(() => /flag_needs_human/.test(document.querySelector('[data-policeman-past]')?.textContent || ''), null, { timeout: 10000 });
const pastText = await page.$eval('[data-policeman-past]', (e) => e.textContent);
await shotMain('kanban-policeman-past-session.png');
await page.click('[data-policeman-back]');
await page.waitForSelector('[data-conversation-head]', { timeout: 10000 });

// Back to the board: the subtab remembers and the board still renders.
await page.click('[data-kanban-sub="board"]');
await page.waitForSelector('[data-kanban] [data-board-goal]', { timeout: 10000 });
const boardBack = !!(await page.$('[data-kanban]'));

await browser.close();
await server.close();

const checks = {
  boardIsDefaultSubtab: boardFirst,
  policemanHiddenFromStrip: !stripTabs.some((t) => /Policeman/.test(t)),
  statePill: state[0] === 'on' && /armed/.test(state[1]),
  metaShowsContextAndSession: /context/.test(meta) && /187k/.test(meta) && /400k/.test(meta) && /session #2/.test(meta) && /1 rollover/.test(meta),
  verdictShown: /1 stuck/.test(verdict),
  twoSessionsListed: sessionChips.length === 2 && /now/.test(sessionChips[1]),
  archPageEmbedded: /Policeman/.test(convName[0]) && convName[1] === true && !removeShown,
  conversationRendered: turns >= 2,
  policemanComposerHint: /policeman/i.test(composerPlaceholder),
  pastSessionShowsItsFlag: /flag_needs_human/.test(pastText) && /human assistance requested/.test(pastText),
  backToBoard: boardBack,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ state, meta, verdict, sessionChips, convName, removeShown, turns, composerPlaceholder, stripTabs, pageErrors: errs, checks, out: ['kanban-policeman-subtab.png', 'kanban-policeman-past-session.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
