// Evidence for fleet task 592abffb (openspec arch-subagents-tab): one "Arch agent" tab +
// one "Subagents" tab with a vertical conversation selector — no more one toolbar tab per
// goal conversation.
//
//   node tests/ui/shot-arch-subagents.mjs before   (run on the OLD code: the cluttered strip)
//   node tests/ui/shot-arch-subagents.mjs          (the new UI, with assertions)
//
// Shots: arch-subagents-toolbar-{before,after}.png (the tab strip), arch-subagents-tab.png
// (selector + selected conversation), arch-subagents-selector.png (the rows with the
// status circles). The "after" run asserts: no arch:<id> toolbar tabs; the Subagents label
// carries the running+needs-human count; rows sort attention-first and reuse the
// AgentStatusDot classes (running pulse / claimed amber / free green / idle grey); the
// selected row renders the conversation view on the right; Stop sits on the busy goal,
// hide works on a finished one; a legacy ?tab=arch:<id> deep link migrates to Subagents
// with that conversation selected.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const tag = process.argv[2] === 'before' ? 'before' : 'after';
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const now = Date.now();
const goalView = (id, convId, text, state, loopStatus, extra = {}) => ({
  id, conversation: { id: convId, name: `goal: ${text.split('\n')[0]}` }, goal: text, state,
  busy: state === 'running', owns: [], tasks: [], iterations: extra.iterations ?? 3, maxIterations: 12,
  loopStatus, loopActive: state === 'running', stopReason: extra.stopReason ?? null, stopDetail: extra.stopDetail ?? null,
  phase: 'work', lastSentAt: extra.lastSentAt ?? now - 120000, pollSeconds: 300,
  startedAt: now - 3600000, endedAt: extra.endedAt ?? null, startedBy: 'operator', outcome: extra.outcome ?? null, queued: extra.queued ?? 0,
});
const G = {
  turn: goalView('cb273fff', '@arch:cb273fff', 'Bring every fleet node to the newest harness build', 'running', 'looping', { lastSentAt: now - 20000, iterations: 5 }),
  ask: goalView('8bfb01db', '@arch:8bfb01db', 'Migrate the staging database to the new schema', 'stopped', 'escalate', { stopReason: 'needs-human', stopDetail: 'NEEDS_HUMAN: which staging DB may I drop — db-a or db-b?', lastSentAt: now - 300000 }),
  poll: goalView('9c3ac75c', '@arch:9c3ac75c', 'Keep the exporter branch green until review', 'running', 'looping', { lastSentAt: now - 240000, queued: 1 }),
  done: goalView('4efba344', '@arch:4efba344', 'Ship the CSV exporter end to end', 'done', 'done', { endedAt: now - 7200000, outcome: 'GOAL_VERIFIED' }),
  err: goalView('88449170', '@arch:88449170', 'Rename the settings page across the fleet', 'error', 'error', { stopReason: 'error', stopDetail: "the agent's run errored", endedAt: now - 5400000 }),
};
const convRow = (g, running = false) => ({ id: g.conversation.id, name: g.conversation.name, isDefault: false, createdAt: now - 3600000, sessionId: 's-' + g.id, loop: { kind: 'goal', active: g.loopActive, status: g.loopStatus }, running, goal: g, busy: g.busy });
const conversations = [
  { id: '@arch', name: 'Arch agent', isDefault: true, createdAt: now - 86400000, sessionId: 's0', loop: null, running: false, goal: null, busy: false },
  convRow(G.turn, true), convRow(G.ask), convRow(G.poll), convRow(G.done), convRow(G.err),
];
const messagesOf = (convId) => ({
  sessionId: 's-' + convId, total: 2, messages: [
    { role: 'user', text: 'Work toward this goal until it is genuinely achieved…', at: now - 3600000 },
    { role: 'assistant', text: convId.includes('8bfb01db') ? 'NEEDS_HUMAN: which staging DB may I drop — db-a or db-b?' : 'Polled the agents; two branches moved, nothing blocked. Continuing on the next poll.', at: now - 300000 },
  ],
});
function mock(pathname, search) {
  const conv = new URLSearchParams(search).get('conv');
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch/conversations': return { conversations };
    case '/api/arch': {
      const c = conversations.find((x) => x.id === (conv || '@arch')) || conversations[0];
      return { conversation: { id: c.id, name: c.name, isDefault: c.isDefault }, gateOpen: true, killSwitch: true, fleet: { selfLabel: 'spacex' }, goals: Object.values(G), goal: c.goal, agents: [], recipes: [] };
    }
    case '/api/arch/messages': return messagesOf(conv || '@arch');
    case '/api/autopilot/loops': return { loops: [] };
    case '/api/taskgraph': return { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    case '/api/recurring': return { tasks: [] };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());

async function open(extraInit) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((extra) => {
    localStorage.setItem('manageapp.layout', 'tabs');
    localStorage.setItem('manageapp.hidden', '[]');
    localStorage.setItem('claudeweb_ui_mode', 'advanced');
    localStorage.removeItem('manageapp.paneOrder');
    localStorage.removeItem('manageapp.subagent');
    localStorage.removeItem('manageapp.subagentsHidden');
    if (extra?.tab) localStorage.setItem('manageapp.tab', extra.tab); else localStorage.removeItem('manageapp.tab');
  }, extraInit || null);
  await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const { pathname, search } = new URL(route.request().url());
    if (pathname === '/api/arch/stream') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, search)) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, errs };
}
const strip = (page) => page.$eval('.mg__tabs', (n) => [...n.querySelectorAll('[data-tab]')].map((b) => ({ k: b.dataset.tab, label: b.textContent.trim() })));

if (tag === 'before') {
  const { ctx, page, errs } = await open();
  await page.goto(`${base}/manage.html?tab=arch&layout=tabs`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.mg__tabs [data-tab]').length > 11, null, { timeout: 60000 });
  const tabs = await strip(page);
  await (await page.$('.mg__head')).screenshot({ path: path.join(OUT, 'arch-subagents-toolbar-before.png') });
  await ctx.close(); await browser.close(); await server.close();
  console.log(JSON.stringify({ tag, tabs: tabs.map((t) => t.k), convTabs: tabs.filter((t) => t.k.startsWith('arch:')).length, pageErrors: errs }, null, 1));
  process.exit(errs.length === 0 && tabs.some((t) => t.k.startsWith('arch:')) ? 0 : 1);
}

// ---- after: the two-tab strip and the Subagents tab -------------------------------------------
const a = await open();
await a.page.goto(`${base}/manage.html?tab=subagents&layout=tabs`, { waitUntil: 'domcontentloaded' });
await a.page.waitForSelector('[data-subagents-list]', { timeout: 60000 });
await a.page.waitForSelector('[data-subagent]', { timeout: 10000 });
const tabs = await strip(a.page);
await (await a.page.$('.mg__head')).screenshot({ path: path.join(OUT, 'arch-subagents-toolbar-after.png') });
// The selector: rows, order, dot classes.
const rows = await a.page.$$eval('[data-subagent]', (ns) => ns.map((n) => ({
  id: n.dataset.subagent, state: n.dataset.subagentState,
  dot: [...(n.querySelector('.agent-dot')?.classList || [])].find((c) => c.startsWith('agent-dot--')),
  stop: !!n.querySelector('[data-stop-goal]'), hide: !!n.querySelector('[data-hide-subagent]'),
  question: n.querySelector('[data-subagent-question]')?.textContent || null,
})));
await (await a.page.$('[data-subagents-list]')).screenshot({ path: path.join(OUT, 'arch-subagents-selector.png') });
// Select the needs-human conversation: the right side renders ITS transcript.
await a.page.click('[data-subagent="@arch:8bfb01db"]');
await a.page.waitForSelector('[data-conv="@arch:8bfb01db"]', { timeout: 10000 });
const askText = await a.page.$eval('[data-conv="@arch:8bfb01db"]', (n) => n.textContent);
await (await a.page.$('[data-subagents]')).screenshot({ path: path.join(OUT, 'arch-subagents-tab.png') });
// Hide a finished conversation: it leaves the list; "show hidden" brings it back.
await a.page.click('[data-hide-subagent="@arch:4efba344"]');
const afterHide = await a.page.$$eval('[data-subagent]', (ns) => ns.map((n) => n.dataset.subagent));
const errsA = a.errs; await a.ctx.close();

// Legacy deep link: a saved per-goal tab key lands on Subagents with that conversation shown.
const b = await open({ tab: 'arch:@arch:9c3ac75c' });
await b.page.goto(`${base}/manage.html?layout=tabs`, { waitUntil: 'domcontentloaded' });
await b.page.waitForSelector('[data-subagents-conv="@arch:9c3ac75c"]', { timeout: 60000 });
const migratedTab = await b.page.evaluate(() => new URL(window.location.href).searchParams.get('tab'));
const errsB = b.errs; await b.ctx.close();

await browser.close(); await server.close();

const subLabel = tabs.find((t) => t.k === 'subagents')?.label || '';
const result = {
  exactlyTwoArchTabsNoPerGoalTabs: tabs.filter((t) => t.k.startsWith('arch:')).length === 0 && tabs.some((t) => t.k === 'arch') && tabs.some((t) => t.k === 'subagents'),
  subagentsLabelCarriesTheCount: /3/.test(subLabel), // turn + needs-human + polling
  attentionSortsFirst: rows[0]?.id === '@arch:8bfb01db' || rows[0]?.id === '@arch:cb273fff',
  dotsReuseTheAgentPalette: rows.find((r) => r.id === '@arch:cb273fff')?.dot === 'agent-dot--running'
    && rows.find((r) => r.id === '@arch:8bfb01db')?.dot === 'agent-dot--claimed'
    && rows.find((r) => r.id === '@arch:9c3ac75c')?.dot === 'agent-dot--free'
    && rows.find((r) => r.id === '@arch:4efba344')?.dot === 'agent-dot--idle',
  theQuestionShowsOnTheRow: /which staging DB/.test(rows.find((r) => r.id === '@arch:8bfb01db')?.question || ''),
  stopOnBusyHideOnFinished: rows.find((r) => r.id === '@arch:cb273fff')?.stop && rows.find((r) => r.id === '@arch:4efba344')?.hide && !rows.find((r) => r.id === '@arch:4efba344')?.stop,
  selectingRendersTheConversation: /which staging DB may I drop/.test(askText),
  hideRemovesFromTheList: !afterHide.includes('@arch:4efba344'),
  legacyGoalTabMigratesToSubagents: migratedTab === 'subagents',
  noPageErrors: errsA.length === 0 && errsB.length === 0,
};
console.log(JSON.stringify({ tabs: tabs.map((t) => `${t.k}:${t.label}`), rows, subLabel, afterHide, migratedTab, pageErrors: [...errsA, ...errsB], result }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
