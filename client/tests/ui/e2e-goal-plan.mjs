// REAL end-to-end for openspec goal-step-plan (fleet task 94c722e7) against a BUILT, isolated
// harness instance (.claudeweb-preview/goal-plan-live.ps1 boots it and runs this): a small
// goal with a declared 3-step plan — send a read-only hello to a local repo agent → wait for
// its reply → mark done — driven by the REAL arch (paid turns, on purpose). The script
// watches the goal's plan through the API and screenshots the Subagents tab's stepper every
// time a step changes state, then checks that the arch marked steps with mark_step (audit),
// that evidence landed, and that the finished goal's summary carried the plan.
// Env: BASE (http://127.0.0.1:port), PW (the instance's password). Prints one JSON summary.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE; const PW = process.env.PW;
if (!BASE || !PW) { console.log(JSON.stringify({ error: 'BASE and PW are required' })); process.exit(1); }
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const MAX_MS = Number(process.env.MAX_MINUTES || 18) * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('manageapp.layout', 'tabs'); localStorage.setItem('manageapp.hidden', '[]'); localStorage.removeItem('manageapp.subagent'); });
const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } });
if (!login.ok()) { console.log(JSON.stringify({ error: `login failed: ${login.status()}` })); process.exit(1); }
const api = async (method, p, data) => {
  const r = await ctx.request.fetch(`${BASE}/api${p}`, { method, data, headers: { 'X-Auth-Password': PW } });
  const text = await r.text();
  try { return { status: r.status(), body: JSON.parse(text) }; } catch { return { status: r.status(), body: text }; }
};

const result = { shots: [], transitions: [] };
let goal = null;
try {
  // ---- seed: the self repo (serves the Management App), the target agent, scope, engine on, a fast poll ----
  const repos = (await api('GET', '/repos')).body;
  const list = Array.isArray(repos) ? repos : repos.repos || [];
  const self = list.find((r) => r.isSelf);
  const target = list.find((r) => /birokrat ai platform/i.test(r.name)) || list.find((r) => !r.isSelf) || self;
  if (!self || !target) throw new Error('no self / target repo on the instance');
  await api('POST', '/dock', { repoId: target.id, repoName: target.name });
  const scope = await api('POST', '/arch/scope', { repoIds: [target.id], fleet: [] });
  const engine = await api('POST', '/autopilot/config', { enabled: true });
  const quiet = await api('POST', '/arch/loop', { action: 'quiet', quietSeconds: 30 });
  result.seeded = { self: self.id, target: `${target.name} (${target.handle || target.id})`, scope: scope.status, engine: engine.status, quiet: quiet.status };
  const handle = target.handle ? `${(await api('GET', '/arch')).body?.fleet?.selfLabel || 'self'}/${target.handle}` : target.id;

  // ---- the goal: 3 declared steps ----
  const text = `Say hello to the repo agent ${handle} and confirm it answered. The Operator asks for this explicitly (this message is the Operator's ask). `
    + `STEP 1 — send_task to ${handle} with exactly this text: "Reply with exactly one line: HELLO FROM ${target.name}. Do not read, create or modify any file." — done: send_task answered sent. `
    + `STEP 2 — wait for its reply: on each poll call read_transcript on ${handle} (tail 2) until its one-line HELLO reply is there — done: the transcript shows the HELLO line. `
    + `STEP 3 — mark every step of the plan done with evidence (the closing line you read) and end your reply with LOOP_DONE — done: 3/3 steps done.`;
  const steps = [
    { title: `send a read-only hello to ${handle}`, done: 'send_task answered sent', kind: 'send' },
    { title: 'wait for its one-line reply (read_transcript on each poll)', done: 'the transcript shows the HELLO line', kind: 'wait' },
    { title: 'mark the plan done and end with LOOP_DONE', done: '3/3 steps done', kind: 'verify' },
  ];
  const started = await api('POST', '/arch/goals', { goal: text, repos: [handle], maxIterations: 8, steps });
  log('start', started.status, started.body?.status, (started.body?.detail || started.body?.error || '').slice(0, 200));
  if (started.status !== 200) throw new Error(`goal did not start: ${JSON.stringify(started.body).slice(0, 300)}`);
  goal = started.body.goal;
  result.goal = { id: goal.id, conversation: goal.conversation?.id, planAtStart: goal.plan.map((s) => `${s.index}:${s.state}`), derived: goal.planDerived };

  // ---- the Subagents tab on the real harness, the goal selected ----
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/api/localview/${self.id}/app/events-feed/manage/index.html?tab=subagents&layout=tabs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-subagents-list]', { timeout: 60000 });
  await page.waitForSelector(`[data-subagent="${goal.conversation.id}"]`, { timeout: 30000 });
  await page.click(`[data-subagent="${goal.conversation.id}"]`);
  await page.waitForSelector(`[data-goal-plan="${goal.id}"]`, { timeout: 30000 });
  const shot = async (tag) => {
    await sleep(1500);
    const file = `goal-plan-live-${tag}.png`;
    await (await page.$('[data-subagents]')).screenshot({ path: path.join(OUT, file) });
    const panel = await page.$$eval('[data-plan-step]', (ns) => ns.map((n) => `${n.dataset.planStep}:${n.dataset.planState}`)).catch(() => []);
    result.shots.push({ file, panel });
    return file;
  };
  await shot('0-start');

  // ---- watch the plan change, shot per transition ----
  const t0 = Date.now();
  let last = '';
  let n = 0;
  for (;;) {
    const g = (await api('GET', '/arch/goals')).body?.goals?.find((x) => x.id === goal.id);
    if (g) {
      goal = g;
      const sig = `${g.state}|${g.loopStatus}|${g.plan.map((s) => `${s.index}:${s.state}${s.evidence ? '+' : ''}`).join(',')}`;
      if (sig !== last) {
        last = sig;
        n += 1;
        result.transitions.push({ at: Math.round((Date.now() - t0) / 1000), sig, iterations: g.iterations, held: g.held });
        log('plan', sig, 'iter', g.iterations);
        if (n <= 8) await shot(`${n}-${g.plan.filter((s) => s.state === 'done').length}done`);
      }
      if (g.state !== 'running') break;
      if (g.held) {
        // A NEEDS_HUMAN hold would block the demo; answer it through the plan panel's path.
        log('held on', g.stopDetail);
        await api('POST', `/arch/goals/${g.id}/answer`, { text: 'Yes — go ahead exactly as the goal says; it is a read-only hello.' });
      }
    }
    if (Date.now() - t0 > MAX_MS) { result.timeout = true; break; }
    await sleep(5000);
  }
  await shot('final');
  result.final = { state: goal.state, outcome: goal.outcome, iterations: goal.iterations, plan: goal.plan.map((s) => ({ i: s.index, state: s.state, evidence: s.evidence?.line || null, note: s.note })), progress: goal.progress };

  // ---- the arch really marked steps (audit), and the summary carried the plan ----
  const tools = (await api('GET', '/arch/tools')).body;
  const mark = (tools?.tools || []).find((t) => t.name === 'mark_step');
  const edit = (tools?.tools || []).find((t) => t.name === 'edit_goal_plan');
  result.toolCalls = { mark_step: mark?.calls || 0, lastMark: mark?.lastOutcome || null, edit_goal_plan: edit?.calls || 0 };
  const calls = (await api('GET', `/arch/toolcalls?conv=${encodeURIComponent(goal.conversation.id)}`)).body;
  result.goalConvToolCalls = (calls?.calls || calls?.toolCalls || []).map((c) => c.name || c.tool).filter(Boolean).slice(0, 40);
  let summary = null;
  for (let i = 0; i < 36 && !summary; i++) {
    const msgs = (await api('GET', '/arch/messages?conv=@arch')).body?.messages || [];
    summary = msgs.find((m) => m.role === 'user' && typeof m.text === 'string' && m.text.includes(`[goal ${goal.id}`))?.text || null;
    if (!summary) await sleep(5000);
  }
  result.summary = summary ? { carriesThePlan: /Step plan \(\d+\/\d+ done/.test(summary), head: summary.slice(0, 600) } : null;
  if (goal.state === 'running') await api('POST', `/arch/goals/${goal.id}/stop`, {});
} catch (e) {
  result.error = String(e?.stack || e);
  if (goal?.id) await api('POST', `/arch/goals/${goal.id}/stop`, {}).catch(() => {});
}
await ctx.close(); await browser.close();

const plan = result.final?.plan || [];
const checks = {
  goalStartedWithTheDeclaredPlan: result.goal?.planAtStart?.join(',') === '1:pending,2:pending,3:pending' && result.goal?.derived === false,
  theArchMarkedStepsItself: (result.toolCalls?.mark_step || 0) >= 2,
  stepsMovedThroughStates: result.transitions.length >= 3,
  helloWasSentAndAnswered: plan.filter((s) => s.state === 'done').length >= 2,
  evidenceLanded: plan.some((s) => s.state === 'done' && s.evidence),
  goalEnded: ['done', 'capped', 'stopped'].includes(result.final?.state) && !result.timeout,
  verifiedDone: result.final?.state === 'done',
  summaryCarriedThePlan: !!result.summary?.carriesThePlan,
  noPageErrors: errs.length === 0,
};
result.checks = checks;
result.pageErrors = errs;
console.log(JSON.stringify(result, null, 1));
const must = ['goalStartedWithTheDeclaredPlan', 'theArchMarkedStepsItself', 'stepsMovedThroughStates', 'helloWasSentAndAnswered', 'evidenceLanded', 'goalEnded', 'noPageErrors'];
console.log(must.every((k) => checks[k]) ? 'ALL PASS' : 'SOME FAILED');
process.exit(must.every((k) => checks[k]) ? 0 : 1);
