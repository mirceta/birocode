// Evidence for fleet task 93b481e6 (goal conversations get a tabbed view + their own
// Understanding app): Management → Subagents, a selected GOAL conversation whose right pane
// is now three tabs — Step plan · Chat · Understanding. Renders the real Management App
// bundle (Vite) against a mocked fleet: one goal with a blocked step (so the Step-plan tab
// shows its amber badge) and a built Understanding app (so the Understanding tab shows its
// dot and iframes the rendered SPA). The /understanding/app/ route returns a small HTML app.
//
//   node tests/ui/shot-goal-understanding-tabs.mjs
// Output: docs/screenshots/goal-understanding-{understanding,plan,chat}.png
// Asserts: three tabs in order; the Step-plan badge when blocked; the Understanding built
// dot; the Understanding tab renders the Ask/Update button and iframes the app; switching
// tabs works and the choice is remembered.

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
const GOAL_ID = 'g7';
const CONV_ID = '@arch:1a2b3c4d';
const goal = {
  id: GOAL_ID,
  conversation: { id: CONV_ID, name: 'Export the invoices nightly' },
  goal: 'Build a nightly invoice exporter across prg and web-flow-autodev',
  state: 'running', busy: false, held: true,
  owns: [{ key: 'src-monster|r-prg', handle: 'MONSTER/prg' }, { key: 'src-monster|r-wfa', handle: 'MONSTER/web-flow' }],
  tasks: [], iterations: 4, maxIterations: 20, loopStatus: 'escalate', loopActive: false,
  stopReason: 'needs-human', stopDetail: 'Which storage bucket should the nightly export write to?',
  phase: 'work', lastSentAt: now - 120000, pollSeconds: 30, startedAt: now - 3600000, endedAt: null,
  startedBy: 'operator', outcome: null, queued: 0,
  plan: [
    { index: 1, title: 'Scaffold the exporter CLI in prg', kind: 'relay-loop', state: 'done', done: 'builds and runs on a sample', note: '', counter: 2, evidence: [] },
    { index: 2, title: 'Wire the web-flow trigger', kind: 'relay-loop', state: 'done', done: 'trigger fires nightly', note: '', evidence: [] },
    { index: 3, title: 'Choose the storage target', kind: 'decision', state: 'blocked', done: 'bucket chosen', note: 'Which storage bucket should the nightly export write to?', evidence: [] },
    { index: 4, title: 'End-to-end verify a real export', kind: 'verify', state: 'pending', done: 'one real nightly export lands', note: '', evidence: [] },
  ],
  planDerived: false, progress: { done: 2, total: 4 }, activeStep: 3, blockedSteps: 1, awaitsHuman: true,
  continuesGoalId: null,
  understanding: { built: true, builtAt: now - 60000 },
};
const conversations = [{
  id: CONV_ID, name: 'Export the invoices nightly', isDefault: false, createdAt: now - 3600000,
  sessionId: 's-1', loop: { kind: 'arch-goal', active: false, status: 'escalate' }, running: true, busy: false, goal,
}];

// The "rendered" goal understanding app the iframe loads.
const APP_HTML = `<!doctype html><html><head><meta charset=utf-8><style>
  body{margin:0;background:#0e1116;color:#e6edf3;font:14px/1.5 system-ui;padding:22px}
  h1{font-size:17px;margin:0 0 10px} .mut{color:#9aa7b4}
  .step{border:1px solid #2a323d;border-radius:8px;padding:8px 12px;margin:6px 0;background:#151a21}
  .b{border-left:3px solid #e0b35a} .d{border-left:3px solid #6fcf7a}
  .who{display:inline-block;font-size:11px;color:#7fb3f5;border:1px solid #2a323d;border-radius:999px;padding:1px 8px;margin-right:6px}
</style></head><body>
  <h1>Nightly invoice exporter — goal orchestration</h1>
  <p class="mut">Objective: a nightly export across <b>prg</b> and <b>web-flow-autodev</b>. 2 of 4 steps done; 1 blocked on the Operator.</p>
  <div><span class="who">MONSTER/prg</span><span class="who">MONSTER/web-flow</span></div>
  <div class="step d">1 · Scaffold the exporter CLI — done</div>
  <div class="step d">2 · Wire the web-flow trigger — done</div>
  <div class="step b">3 · Choose the storage target — <b>blocked</b>: which bucket?</div>
  <div class="step">4 · End-to-end verify — pending</div>
</body></html>`;

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'SPACEX4' }, gateOpen: true, killSwitch: true };
    case '/api/arch/conversations': return { conversations };
    case '/api/arch/goals': return { goals: [goal] };
    case `/api/arch/goals/${GOAL_ID}/understanding/status`: return { goalId: GOAL_ID, status: 'done', error: null, summary: 'built the goal-understanding app — rendered below', startedAt: now - 70000, finishedAt: now - 60000, built: true, builtAt: now - 60000 };
    case '/api/arch/messages': return { messages: [
      { role: 'user', text: 'Build a nightly invoice exporter across prg and web-flow.' },
      { role: 'assistant', text: 'Plan declared. Scaffolded the CLI in prg and wired the web-flow trigger. I need a decision: which storage bucket should the nightly export write to?' },
    ] };
    case '/api/taskgraph': return { staleHours: 24, nodes: [], edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    case '/api/autopilot/loops': return { loops: [] };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 }, deviceScaleFactor: 2 });
await ctx.addInitScript((convId) => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.subagent', convId);
  // NB: don't clear the goalTab memory here — addInitScript runs on every load (incl. the
  // reload), and the reload step verifies the remembered choice survives. The context is
  // fresh, so no stale memory exists on the first load anyway.
}, CONV_ID);
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  // The iframe loads the rendered app; everything under /understanding/app/ returns the SPA.
  if (pathname.includes('/understanding/app')) { route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: APP_HTML }); return; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/manage.html?tab=subagents&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-goal-tabs]', { timeout: 60000 });

const snap = () => page.evaluate(() => ({
  tabs: [...document.querySelectorAll('[data-goal-tab]')].map((b) => b.dataset.goalTab),
  on: document.querySelector('[data-goal-tab].sa__tab--on')?.dataset.goalTab || null,
  planBadge: !!document.querySelector('[data-goal-tab-badge]'),
  builtDot: !!document.querySelector('[data-goal-tab-built]'),
  panel: document.querySelector('[data-goal-tabpanel]')?.dataset.goalTabpanel || null,
  askBtn: !!document.querySelector('[data-gu-ask]'),
  frame: !!document.querySelector('[data-gu-frame]'),
  planSteps: document.querySelectorAll('[data-plan-step]').length,
}));

// Default tab: a blocked step → Step plan opens first.
const s0 = await snap();

// Understanding tab
await page.click('[data-goal-tab="understanding"]');
await page.waitForSelector('[data-gu-frame]', { timeout: 10000 });
await page.waitForTimeout(400);
const sU = await snap();
await page.screenshot({ path: path.join(OUT, 'goal-understanding-understanding.png') });

// Step plan tab
await page.click('[data-goal-tab="plan"]');
await page.waitForSelector('[data-plan-steps]', { timeout: 10000 });
await page.waitForTimeout(200);
const sP = await snap();
await page.screenshot({ path: path.join(OUT, 'goal-understanding-plan.png') });

// Chat tab
await page.click('[data-goal-tab="chat"]');
await page.waitForTimeout(400);
const sC = await snap();
await page.screenshot({ path: path.join(OUT, 'goal-understanding-chat.png') });

// Memory: reload, the remembered tab (chat) comes back.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-goal-tabs]', { timeout: 30000 });
await page.waitForTimeout(300);
const sR = await snap();

await ctx.close();
await browser.close();
await server.close();

const result = {
  threeTabsInOrder: JSON.stringify(s0.tabs) === JSON.stringify(['plan', 'chat', 'understanding']),
  defaultsToPlanWhenBlocked: s0.on === 'plan' && s0.panel === 'plan',
  planBadgeWhenBlocked: s0.planBadge === true,
  understandingBuiltDot: s0.builtDot === true,
  understandingTabRendersAppAndButton: sU.panel === 'understanding' && sU.askBtn === true && sU.frame === true,
  planTabShowsStepper: sP.panel === 'plan' && sP.planSteps === 4,
  chatTabSwitches: sC.panel === 'chat',
  choiceRemembered: sR.on === 'chat',
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ s0, sU, sP, sC, sR, errs: errs.slice(0, 5), result }, null, 1));
const failed = Object.entries(result).filter(([, v]) => !v).map(([k]) => k);
if (failed.length) { console.error('FAILED:', failed.join(', ')); process.exit(1); }
