// Evidence for fleet task 94c722e7 (openspec goal-step-plan): the goal's STEP PLAN in the
// Subagents tab — a vertical stepper above the selected conversation with live states
// (done / active / blocked + answer box / pending / skipped), evidence rows, the done/total
// fraction on the selector rows, the amber circle on a blocked step, the Subagents label
// counting a blocked goal, the Operator's mark menu, and Continue-from-the-plan on an ended
// goal. Mocked /api; the stepper "changing state" is shown by re-polling a mutated board.
//
//   node tests/ui/shot-goal-plan.mjs
//
// Shots: goal-plan-stepper.png (the panel: done / active / pending + evidence),
// goal-plan-blocked.png (the NEEDS_HUMAN hold with the answer box), goal-plan-selector.png
// (rows with fractions), goal-plan-continue.png (an ended goal's carried-over plan + button),
// goal-plan-poll-before/after.png (the same goal before and after the arch marked the next
// steps — the panel re-rendered on its poll). The REAL run's shots (goal-plan-live-*.png)
// come from client/tests/ui/e2e-goal-plan.mjs on an isolated harness.

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
const step = (index, title, kind, state, extra = {}) => ({ index, title, done: extra.done ?? null, kind, state, note: extra.note ?? null, evidence: extra.evidence ?? null, counter: extra.counter ?? 0, updatedAt: now - 60000 * (10 - index), awaitsHuman: !!extra.awaitsHuman });
const goalView = (id, convId, text, state, loopStatus, plan, extra = {}) => {
  const done = plan.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  const active = plan.find((s) => s.state === 'active');
  return {
    id, conversation: { id: convId, name: `goal: ${text.split('\n')[0]}` }, goal: text, state,
    busy: state === 'running' && loopStatus === 'looping', held: state === 'running' && loopStatus === 'escalate',
    owns: [{ key: 'r-prg', handle: 'spacex/prg' }], tasks: [], iterations: extra.iterations ?? 3, maxIterations: 12,
    loopStatus, loopActive: loopStatus === 'looping', stopReason: extra.stopReason ?? null, stopDetail: extra.stopDetail ?? null,
    phase: 'work', lastSentAt: extra.lastSentAt ?? now - 120000, pollSeconds: 300,
    startedAt: now - 3600000, endedAt: extra.endedAt ?? null, startedBy: 'operator', outcome: extra.outcome ?? null, queued: 0,
    plan, planDerived: !!extra.planDerived, progress: { done, total: plan.length }, activeStep: active ? active.index : null,
    blockedSteps: plan.filter((s) => s.state === 'blocked').length, awaitsHuman: plan.some((s) => s.state === 'blocked' && s.awaitsHuman), continuesGoalId: extra.continuesGoalId ?? null,
  };
};
const exporterPlan = (phase) => [
  step(1, 'send brief A to spacex/prg (CSV exporter, read-only probe first)', 'send', 'done', { done: 'prg answers with its closing line', evidence: { closingLine: 'TASK COMMITTED 4efba344 feat/csv-exporter 9c1d2e7', line: 'closing line' } }),
  step(2, "wait for prg's closing line, verify the export on the hub", 'wait', phase >= 2 ? 'done' : 'active', { done: 'the file is listed by hub_files', evidence: phase >= 2 ? { hubPath: 'prg/exports/customers.csv', size: 48213, line: 'hub' } : null }),
  step(3, 'hub_transfer prg → fluent, poll the job', 'transfer', phase >= 3 ? 'done' : phase === 2 ? 'active' : 'pending', { done: 'the job reports copied', evidence: phase >= 3 ? { jobId: 'xfer-7f21', line: 'job' } : null }),
  step(4, 'send brief B to spacex/fluent (import + PR)', 'send', phase >= 3 ? 'active' : 'pending', { done: "fluent's PR is open" }),
  step(5, "relay fluent's questions to prg", 'relay-loop', phase >= 3 ? 'active' : 'pending', { counter: phase >= 3 ? 2 : 0 }),
  step(6, 'verify the PR is mergeable', 'verify', 'pending', { done: 'gh pr view says MERGEABLE' }),
];
const G = {
  live: goalView('cb273fff', '@arch:cb273fff', 'Ship the CSV exporter end to end: prg exports, fluent imports, PR open', 'running', 'looping', exporterPlan(1), { lastSentAt: now - 20000, iterations: 5 }),
  ask: goalView('8bfb01db', '@arch:8bfb01db', 'Migrate the staging database to the new schema', 'running', 'escalate', [
    step(1, 'send the migration brief to spacex/db', 'send', 'done', { evidence: { closingLine: 'TASK COMMITTED 8bfb01db feat/schema-v2 a1b2c3d', line: 'closing line' } }),
    step(2, 'ask the Operator which staging DB may be dropped', 'human', 'blocked', { note: 'which staging DB may I drop — db-a or db-b?', awaitsHuman: true }),
    step(3, 'send the drop + migrate brief', 'send', 'pending', { done: 'db answers with its closing line' }),
    step(4, 'verify the schema version on the hub', 'verify', 'pending'),
  ], { stopReason: 'needs-human', stopDetail: 'NEEDS_HUMAN: which staging DB may I drop — db-a or db-b?', lastSentAt: now - 300000 }),
  derived: goalView('9c3ac75c', '@arch:9c3ac75c', 'Keep the exporter branch green until review\n\nSTEP 1 — rebase onto main\nSTEP 2 — run the tests\nSTEP 3 — report', 'running', 'looping', [
    step(1, 'rebase onto main', 'other', 'skipped', { note: 'already on main' }),
    step(2, 'run the tests', 'verify', 'active'),
    step(3, 'report', 'other', 'pending'),
  ], { lastSentAt: now - 240000, planDerived: true }),
  capped: goalView('4efba344', '@arch:4efba344', 'Rename the settings page across the fleet', 'capped', 'capped', [
    step(1, 'send the rename brief to spacex/web', 'send', 'done', { evidence: { url: 'https://github.com/mirceta/web/pull/41', line: 'PR' } }),
    step(2, 'send the rename brief to spacex/mobile', 'send', 'done', { evidence: { url: 'https://github.com/mirceta/mobile/pull/9', line: 'PR' } }),
    step(3, 'wait for both PRs to be mergeable', 'wait', 'pending'),
    step(4, 'report to the Operator', 'other', 'pending'),
  ], { endedAt: now - 5400000, stopReason: 'cap', stopDetail: 'cap 12/12 reached', outcome: 'cap: cap 12/12 reached' }),
  old: goalView('88449170', '@arch:88449170', 'Bring every fleet node to the newest harness build', 'done', 'done', [], { endedAt: now - 7200000, outcome: 'GOAL_VERIFIED' }),
};
let livePhase = 1;
const convRow = (g, running = false) => ({ id: g.conversation.id, name: g.conversation.name, isDefault: false, createdAt: now - 3600000, sessionId: 's-' + g.id, loop: { kind: 'goal', active: g.loopActive, status: g.loopStatus }, running, goal: g, busy: g.busy });
const conversations = () => [
  { id: '@arch', name: 'Arch agent', isDefault: true, createdAt: now - 86400000, sessionId: 's0', loop: null, running: false, goal: null, busy: false },
  convRow({ ...G.live, plan: exporterPlan(livePhase), progress: { done: exporterPlan(livePhase).filter((s) => s.state === 'done').length, total: 6 } }), convRow(G.ask), convRow(G.derived), convRow(G.capped), convRow(G.old),
];
const messagesOf = (convId) => ({
  sessionId: 's-' + convId, total: 2, messages: [
    { role: 'user', text: '[step plan of goal … — data from the harness]\n1. ✓ send brief A … — done\n2. ▶ wait for prg … — active\n…\nYour goal loop\'s prompt follows.\n\nWork toward this goal until it is genuinely achieved…', at: now - 3600000 },
    { role: 'assistant', text: convId.includes('8bfb01db') ? 'Step 2 is blocked on you.\n\nNEEDS_HUMAN: which staging DB may I drop — db-a or db-b?' : 'Marked step 1 done with prg\'s closing line; polling the hub for the export. Continuing on the next poll.', at: now - 300000 },
  ],
});
const posts = [];
function mock(pathname, search, method, body) {
  const conv = new URLSearchParams(search).get('conv');
  if (method === 'POST') {
    posts.push({ pathname, body });
    if (/\/api\/arch\/goals\/[^/]+\/continue$/.test(pathname)) return { ok: true, status: 'continued', detail: 'goal 11112222 continues goal 4efba344', goal: { ...G.capped, id: '11112222', conversation: { id: '@arch:11112222', name: G.capped.conversation.name } } };
    if (/\/api\/arch\/goals\/[^/]+\/answer$/.test(pathname)) return { ok: true, status: 'resumed', detail: 'answer sent to goal 8bfb01db; its loop is armed again', goal: G.ask };
    if (/\/api\/arch\/goals\/[^/]+\/steps\//.test(pathname)) return { ok: true, status: 'marked', detail: 'step 3 "hub_transfer prg → fluent, poll the job" is done; 3/6 done', goal: G.live };
    return { ok: true };
  }
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch/conversations': return { conversations: conversations() };
    case '/api/arch': {
      const c = conversations().find((x) => x.id === (conv || '@arch')) || conversations()[0];
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
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.removeItem('manageapp.paneOrder');
  localStorage.removeItem('manageapp.subagent');
  localStorage.removeItem('manageapp.subagentsHidden');
  localStorage.removeItem('manageapp.tab');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), async (route) => {
  const { pathname, search } = new URL(route.request().url());
  if (pathname === '/api/arch/stream') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  const method = route.request().method();
  let body = null;
  try { body = method === 'POST' ? JSON.parse(route.request().postData() || 'null') : null; } catch { body = null; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, search, method, body)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('dialog', (d) => d.accept());

await page.goto(`${base}/manage.html?tab=subagents&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-subagents-list]', { timeout: 60000 });
await page.waitForSelector('[data-subagent]', { timeout: 10000 });
const strip = await page.$eval('.mg__tabs', (n) => [...n.querySelectorAll('[data-tab]')].map((b) => ({ k: b.dataset.tab, label: b.textContent.trim() })));
const rows = await page.$$eval('[data-subagent]', (ns) => ns.map((n) => ({
  id: n.dataset.subagent, state: n.dataset.subagentState,
  dot: [...(n.querySelector('.agent-dot')?.classList || [])].find((c) => c.startsWith('agent-dot--')),
  progress: n.querySelector('[data-subagent-progress]')?.dataset.subagentProgress || null,
  stop: !!n.querySelector('[data-stop-goal]'), question: n.querySelector('[data-subagent-question]')?.textContent || null,
})));
await (await page.$('[data-subagents-list]')).screenshot({ path: path.join(OUT, 'goal-plan-selector.png') });

// 1. The live goal: the stepper with done / active / pending + evidence; then the arch marks on.
await page.click('[data-subagent="@arch:cb273fff"]');
await page.waitForSelector('[data-goal-plan="cb273fff"]', { timeout: 10000 });
const readPlan = () => page.$$eval('[data-plan-step]', (ns) => ns.map((n) => ({ i: n.dataset.planStep, state: n.dataset.planState, awaits: n.dataset.planAwaits, ev: n.querySelector('[data-plan-evidence]')?.textContent || '', mark: !!n.querySelector('[data-plan-mark]') })));
const plan1 = await readPlan();
const fraction1 = await page.$eval('[data-plan-fraction]', (n) => n.textContent);
await (await page.$('[data-goal-plan]')).screenshot({ path: path.join(OUT, 'goal-plan-stepper.png') });
await (await page.$('[data-goal-plan]')).screenshot({ path: path.join(OUT, 'goal-plan-poll-before.png') });
livePhase = 3; // the arch marked steps 2 and 3 done, 4 + the relay loop active — the next poll shows it
await page.waitForFunction(() => document.querySelector('[data-plan-fraction]')?.textContent === '3/6', null, { timeout: 15000 });
const plan2 = await readPlan();
const fraction2 = await page.$eval('[data-plan-fraction]', (n) => n.textContent);
const rowFraction2 = await page.$eval('[data-subagent="@arch:cb273fff"] [data-subagent-progress]', (n) => n.dataset.subagentProgress);
await (await page.$('[data-goal-plan]')).screenshot({ path: path.join(OUT, 'goal-plan-poll-after.png') });
// The Operator's mark menu posts the same path the arch uses.
await page.click('[data-plan-mark="6"]');
await page.waitForSelector('[data-plan-mark-menu]', { timeout: 5000 });
await page.click('[data-plan-mark-as="skipped"]');
await page.waitForFunction(() => /marked|step 3/.test(document.querySelector('[data-plan-note]')?.textContent || ''), null, { timeout: 5000 });

// 2. The held goal: the blocked step with the question and the answer box; answering posts.
await page.click('[data-subagent="@arch:8bfb01db"]');
await page.waitForSelector('[data-goal-plan="8bfb01db"]', { timeout: 10000 });
await page.waitForSelector('[data-plan-answer]', { timeout: 10000 });
const held = await readPlan();
const question = await page.$eval('[data-plan-question]', (n) => n.textContent);
await (await page.$('[data-subagents]')).screenshot({ path: path.join(OUT, 'goal-plan-blocked.png') });
await page.fill('[data-plan-answer-text]', 'db-b — db-a is still used by the smoke tests');
await page.click('[data-plan-answer-send]');
await page.waitForFunction(() => /armed again|resumed/.test(document.querySelector('[data-plan-note]')?.textContent || ''), null, { timeout: 5000 });

// 3. A derived plan says so; a skipped step is struck through.
await page.click('[data-subagent="@arch:9c3ac75c"]');
await page.waitForSelector('[data-goal-plan="9c3ac75c"]', { timeout: 10000 });
const derivedHeadline = await page.$eval('[data-plan-headline]', (n) => n.textContent);
const skippedStrike = await page.$eval('[data-plan-step="1"] .gp__step-title', (n) => getComputedStyle(n).textDecorationLine);

// 4. An ended (capped) goal: Continue from the plan.
await page.click('[data-subagent="@arch:4efba344"]');
await page.waitForSelector('[data-goal-plan="4efba344"]', { timeout: 10000 });
await page.waitForSelector('[data-plan-continue]', { timeout: 10000 });
const cappedPlan = await readPlan();
await (await page.$('[data-subagents]')).screenshot({ path: path.join(OUT, 'goal-plan-continue.png') });
await page.click('[data-plan-continue]');
await page.waitForFunction(() => /continues goal/.test(document.querySelector('[data-plan-note]')?.textContent || ''), null, { timeout: 5000 });
// 5. A goal without a plan says so, read-only.
await page.click('[data-subagent="@arch:88449170"]');
await page.waitForSelector('[data-goal-plan="88449170"]', { timeout: 10000 });
const noPlan = await page.$eval('[data-plan-empty]', (n) => n.textContent);

await ctx.close(); await browser.close(); await server.close();

const subLabel = strip.find((t) => t.k === 'subagents')?.label || '';
const result = {
  rowsCarryTheFraction: rows.find((r) => r.id === '@arch:cb273fff')?.progress === '1/6' && rows.find((r) => r.id === '@arch:4efba344')?.progress === '2/4' && rows.find((r) => r.id === '@arch:88449170')?.progress === null,
  blockedStepIsAmberAttentionWithTheQuestion: rows.find((r) => r.id === '@arch:8bfb01db')?.dot === 'agent-dot--claimed' && /db-a or db-b/.test(rows.find((r) => r.id === '@arch:8bfb01db')?.question || '') && rows[0]?.id === '@arch:8bfb01db',
  heldGoalStillOffersStop: rows.find((r) => r.id === '@arch:8bfb01db')?.stop === true,
  subagentsLabelCountsTheBlockedGoal: /3/.test(subLabel), // live (polling) + held (blocked, needs you) + derived (polling)
  stepperShowsDoneActivePendingWithEvidence: plan1.map((s) => s.state).join(',') === 'done,active,pending,pending,pending,pending' && /TASK COMMITTED 4efba344/.test(plan1[0].ev) && fraction1 === '1/6',
  stepperChangesStateLiveOnThePoll: plan2.map((s) => s.state).join(',') === 'done,done,done,active,active,pending' && /customers\.csv \(48213 bytes\)/.test(plan2[1].ev) && /xfer-7f21/.test(plan2[2].ev) && fraction2 === '3/6' && rowFraction2 === '3/6',
  operatorMarkPostsTheStepPath: posts.some((p) => p.pathname === '/api/arch/goals/cb273fff/steps/6' && p.body?.state === 'skipped'),
  blockedStepShowsQuestionAndAnswerBox: held.find((s) => s.i === '2')?.state === 'blocked' && held.find((s) => s.i === '2')?.awaits === '1' && /which staging DB may I drop/.test(question),
  answerPostsAndReportsResume: posts.some((p) => p.pathname === '/api/arch/goals/8bfb01db/answer' && /db-b/.test(p.body?.text || '')),
  derivedPlanSaysSoAndSkippedIsStruck: /derived from the goal text/.test(derivedHeadline) && /line-through/.test(skippedStrike),
  endedGoalOffersContinueAndPosts: cappedPlan.length === 4 && cappedPlan.every((s) => !s.mark) && posts.some((p) => p.pathname === '/api/arch/goals/4efba344/continue'),
  noPlanIsSaidPlainly: /without a step plan/.test(noPlan),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ subLabel, rows, plan1, plan2, held: held.map((s) => `${s.i}:${s.state}${s.awaits === '1' ? '!' : ''}`), question, derivedHeadline, posts: posts.map((p) => p.pathname), pageErrors: errs, result }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
