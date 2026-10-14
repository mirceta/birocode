// REAL end-to-end for openspec repo-agent-subagents (fleet task 5872a223) against a BUILT,
// isolated harness (.claudeweb-preview/subagents-live.ps1 boots it and runs this): a throwaway
// git repo is registered and docked; its repo agent (the PARENT, a real Claude turn) is asked to
// call start_goal_conversation with a declared 3-step plan; the engine runs the SUBAGENT (real turns) in
// the same checkout; the script watches the plan through /api/goal-conversations and screenshots the
// dock's ⑂ Subagents lane each time a step changes state; at the end it checks the summary was
// delivered as a turn tagged "subagent" in the parent's conversation, and the hub views.
// Env: BASE, PW, REPO_PATH (the throwaway checkout). Prints one JSON summary.
import path from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE; const PW = process.env.PW; const REPO_PATH = process.env.REPO_PATH;
if (!BASE || !PW || !REPO_PATH) { console.log(JSON.stringify({ error: 'BASE, PW and REPO_PATH are required' })); process.exit(1); }
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const MAX_MS = Number(process.env.MAX_MINUTES || 20) * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); });
const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } });
if (!login.ok()) { console.log(JSON.stringify({ error: `login failed: ${login.status()}` })); process.exit(1); }
const api = async (method, p, data, headers = {}) => {
  const r = await ctx.request.fetch(`${BASE}/api${p}`, { method, data, headers: { 'X-Auth-Password': PW, ...headers } });
  const text = await r.text();
  try { return { status: r.status(), body: JSON.parse(text) }; } catch { return { status: r.status(), body: text }; }
};

const result = { shots: [], transitions: [], checks: {} };
const check = (k, v, detail) => { result.checks[k] = !!v; log(v ? 'PASS' : 'FAIL', k, detail ? `| ${String(detail).slice(0, 300)}` : ''); };
const errs = [];
let repo = null; let sub = null;
try {
  // ---- seed: the throwaway repo, its dock, the engine on ----
  const added = await api('POST', '/repos', { folder: REPO_PATH, name: 'subagent-e2e' });
  repo = added.body;
  if (!repo?.id) throw new Error(`repo not registered: ${JSON.stringify(added.body)}`);
  const tab = (await api('POST', '/dock', { repoId: repo.id, repoName: repo.name })).body;
  const eng = await api('POST', '/autopilot/config', { enabled: true });
  result.seeded = { repo: repo.id, tab: tab?.id, engine: eng.status };

  // ---- the parent's turn: ask it to start the subagent (a real Claude turn) ----
  const ask = 'This is an end-to-end test of the harness; the Operator asks for exactly this. '
    + 'Call your start_goal_conversation tool exactly once with name "hello-file", maxIterations 8, and this goal: '
    + '"Create the file notes/hello.txt containing exactly the line HELLO FROM THE SUBAGENT, then commit it on the current branch with the message \\"subagent: hello\\". '
    + 'STEP 1 — create notes/hello.txt with that one line — done: the file exists. '
    + 'STEP 2 — commit it on the current branch — done: git log shows subagent: hello. '
    + 'STEP 3 — mark every step done with evidence and end your reply with LOOP_DONE — done: 3/3 steps done." '
    + 'Do not create or change any file yourself. After the tool answers, reply with one line: SUBAGENT <its id>, and stop.';
  const chat = await ctx.request.fetch(`${BASE}/api/chat`, { method: 'POST', data: { message: ask }, headers: { 'X-Auth-Password': PW, 'X-Repo-Id': repo.id }, timeout: 300_000 });
  log('parent turn http', chat.status());
  // the turn runs detached; wait for the subagent to appear
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const l = await api('GET', `/goal-conversations?repo=${repo.id}`);
    if (l.body?.subagents?.length) { sub = l.body.subagents[0]; break; }
    await sleep(3000);
  }
  if (!sub) throw new Error('the parent never started a subagent');
  check('parent started a subagent through start_goal_conversation', sub.startedBy === 'agent', `${sub.id} "${sub.name}" by ${sub.startedBy}`);
  check('declared 3-step plan', (sub.plan || []).length === 3, (sub.plan || []).map((s) => s.title).join(' | '));
  check('it is a writer on the parent branch', sub.readOnly === false && !!sub.branch, sub.branch);
  result.subagent = { id: sub.id, key: sub.key, name: sub.name, branch: sub.branch };

  // ---- the dock lane, watched ----
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/studio?agent=${encodeURIComponent(repo.id)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(`[data-lane-subagents="${repo.id}"]`, { timeout: 60000 });
  await page.click(`[data-lane-subagents="${repo.id}"]`);
  await page.waitForSelector(`[data-subagent="${sub.id}"]`, { timeout: 30000 });
  await page.click(`[data-subagent="${sub.id}"]`);
  const shot = async (name) => {
    const file = path.join(OUT, `repo-subagents-${name}.png`);
    await page.screenshot({ path: file });
    result.shots.push(path.basename(file));
  };
  await shot('started');
  check('lane badge counts the running subagent', await page.locator('[data-subagents-badge]').count() > 0);

  // ---- the main-conversation pointer, taken WHILE the subagent's transcript is the newest in the folder ----
  const checkPointer = async () => {
    const mainBefore = (await api('GET', '/main-conversation', null, { 'X-Repo-Id': repo.id })).body;
    const sessionsNow = (await api('GET', '/sessions', null, { 'X-Repo-Id': repo.id })).body || [];
    const newest = [...sessionsNow].sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))[0];
    if (!newest?.subagent) return false;   // not yet: the subagent has not written last
    result.pointer = { mainBefore: mainBefore?.sessionId, newest: newest?.id, newestIsSubagent: true };
    check("the newest transcript in the folder is the subagent's", true, JSON.stringify(result.pointer));
    check("the main pointer still names the parent's conversation", !!mainBefore?.sessionId && mainBefore.sessionId !== newest.id && !sessionsNow.find((x) => x.id === mainBefore.sessionId)?.subagent, JSON.stringify(mainBefore));
    check('the picker marks exactly one main and names the subagent sessions', sessionsNow.filter((x) => x.isMain).length === 1 && sessionsNow.some((x) => x.subagent?.id === sub.id), JSON.stringify(sessionsNow.map((x) => ({ id: x.id.slice(0, 8), main: x.isMain, sub: x.subagent?.id }))));
    return true;
  };

  let lastPlan = '';
  let ended = null;
  const t1 = Date.now();
  while (Date.now() - t1 < MAX_MS) {
    const v = (await api('GET', `/goal-conversations/${sub.id}`)).body;
    const plan = (v.plan || []).map((s) => `${s.index}:${s.state}`).join(',');
    if (plan !== lastPlan) {
      lastPlan = plan;
      result.transitions.push({ at: new Date().toISOString().slice(11, 19), plan, state: v.state, turns: v.iterations });
      log('plan', plan, v.state, `turn ${v.iterations}/${v.maxIterations}`);
      await page.waitForTimeout(5500); // the panel's poll
      await shot(`plan-${result.transitions.length}`);
    }
    if (!result.pointer && v.sessionId) await checkPointer();
    if (v.state !== 'running') { ended = v; break; }
    await sleep(4000);
  }
  if (!ended) throw new Error('the subagent did not end in time');
  if (!result.pointer) await checkPointer();
  if (!result.pointer) check("the newest transcript in the folder is the subagent's", false, 'never observed (the summary turn wrote first)');
  check('subagent ended done', ended.state === 'done', `${ended.state} — ${ended.outcome}`);
  check('every step green (done)', (ended.plan || []).every((s) => s.state === 'done'), lastPlan);
  check('steps carry evidence', (ended.plan || []).some((s) => s.evidence), JSON.stringify((ended.plan || []).map((s) => s.evidence?.line || null)));
  check('the file exists in the checkout', existsSync(path.join(REPO_PATH, 'notes', 'hello.txt')) && /HELLO FROM THE SUBAGENT/.test(readFileSync(path.join(REPO_PATH, 'notes', 'hello.txt'), 'utf8')));

  // ---- the summary in the parent's conversation ----
  let delivered = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 300_000) {
    const v = (await api('GET', `/goal-conversations/${sub.id}`)).body;
    if (v.summaryDelivered) {
      const runs = (await api('GET', '/runs')).body;
      if (runs?.[repo.id]?.status !== 'running') { delivered = v; break; }
    }
    await sleep(4000);
  }
  check('summary delivered to the parent', !!delivered);
  const runs = (await api('GET', '/runs')).body;
  const parentSession = runs?.[repo.id]?.sessionId;
  const msgs = parentSession ? (await api('GET', `/sessions/${parentSession}/messages`, null, { 'X-Repo-Id': repo.id })).body : null;
  const list = Array.isArray(msgs) ? msgs : msgs?.messages || [];
  const summaryMsg = list.find((m) => m.role === 'user' && /\[goal conversation [0-9a-f]{8} "hello-file" done/.test(m.text || ''));
  check('the summary is a turn in the parent conversation', !!summaryMsg, summaryMsg ? summaryMsg.text.slice(0, 160) : `session ${parentSession}, ${list.length} message(s)`);
  check('the summary turn is tagged goal-conversation', summaryMsg?.actor === 'goal-conversation', summaryMsg?.actor);
  check('the parent answered the summary', list.findIndex((m) => m === summaryMsg) < list.length - 1 && list[list.length - 1]?.role === 'assistant', list[list.length - 1]?.text?.slice(0, 200));
  const mainAfter = (await api('GET', '/main-conversation', null, { 'X-Repo-Id': repo.id })).body;
  check("the pointer names the session the summary turn ran in (in place or forked)", mainAfter?.sessionId === parentSession, `${result.pointer.mainBefore} -> ${mainAfter?.sessionId} (${mainAfter?.setBy})`);
  result.summaryHead = summaryMsg?.text?.split('\n').slice(0, 3).join(' / ');
  result.parentReply = list[list.length - 1]?.text?.slice(0, 400);

  // the parent's Builder lane shows the summary bubble
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await shot('parent-builder');

  // ---- hub views ----
  const fleet = (await api('GET', '/arch/fleet/status')).body;
  const me = (fleet?.machines || []).find((m) => m.self);
  const row = (me?.agents || []).find((a) => a.repoId === repo.id);
  check('Fleet Status carries the subagent counts', row?.subagents?.total === 1, JSON.stringify(row?.subagents));
  const summary = (await api('GET', '/arch/fleet/goal-conversations')).body;
  check('the hub summary lists the agent', (summary?.agents || []).some((a) => a.repoId === repo.id));
  const read = (await api('GET', `/arch/fleet/goal-conversations?sourceId=self&repoId=${repo.id}&id=${sub.id}&tail=4`)).body;
  check('the hub reads its last messages', (read?.data?.selected?.messages || []).length > 0);
  const mgmt = await ctx.newPage();
  mgmt.on('pageerror', (e) => errs.push(e.message));
  const self = ((await api('GET', '/repos')).body || []).find((r) => r.isSelf);
  await mgmt.goto(`${BASE}/api/localview/${self.id}/app/events-feed/manage/index.html?tab=subagents&layout=tabs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mgmt.waitForSelector('[data-fleet-subagents]', { timeout: 60000 });
  await mgmt.waitForTimeout(1500);
  await mgmt.click('[data-fleet-subagent-agent] .fsa__agent-row').catch(() => {});
  await mgmt.waitForTimeout(1500);
  await mgmt.click(`[data-fleet-subagent="${sub.id}"]`).catch(() => {});
  await mgmt.waitForTimeout(2500);
  await mgmt.screenshot({ path: path.join(OUT, 'repo-subagents-hub.png') });
  result.shots.push('repo-subagents-hub.png');
  check('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  result.error = String(e?.stack || e);
  log('ERROR', result.error);
}
await browser.close();
const failed = Object.entries(result.checks).filter(([, v]) => !v).map(([k]) => k);
console.log(JSON.stringify({ ...result, failed }, null, 1));
process.exit(!result.error && failed.length === 0 ? 0 : 1);
