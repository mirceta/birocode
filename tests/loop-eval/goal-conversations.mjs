// Repo-agent subagents eval scenario (openspec repo-agent-subagents — the Operator's
// "can we be sure this is safe?" gate). Real Claude turns on an isolated harness over a
// committed fixture repo. It attacks the main-conversation pointer and the one-writer rule
// from every side the review found, and asserts mechanically:
//
//   1. a writer subagent's turn and the parent never run at the same time — not a chat send
//      (409 subagent-busy), and NOT the parent's own driven loop either;
//   2. while the subagent's transcript is the NEWEST in the shared folder, the main pointer
//      still names the parent's conversation;
//   3. picking a subagent's conversation (or a side conversation) in the main dock tab does NOT
//      make it main — only "make main" does, and a subagent's conversation is refused;
//   4. a side conversation in a second dock tab never moves the pointer;
//   5. the subagent's summary lands in the MAIN conversation and the pointer names its session;
//   6. a restart keeps the pointer; with the pointer file gone (an upgrade from an older build),
//      the pointer is re-seeded from the agent's main dock tab — never from "the newest file";
//   7. a concurrent writer (concurrent: true) runs alongside the parent: the parent's chat send is
//      accepted while it runs.
//
//   node tests/loop-eval/subagents.mjs [--json out.json]
//
// Isolated only (it restarts its own instance). Spends ~8-12 real turns, ~6-12 min. Never CI.

import { existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import * as L from './lib.mjs';

const DEADLINE = L.minutes(Number(process.env.LOOPEVAL_SUBAGENTS_MINUTES || 14));

const WRITER_GOAL =
  'Create the file notes/a.txt in this repository. STEP 1 — first run exactly this command to wait 25 seconds: ' +
  'node -e "setTimeout(() => {}, 25000)" — done: the command returned. STEP 2 — create notes/a.txt containing the single line A FROM THE SUBAGENT and commit ' +
  'it on the current branch with the message "subagent: a" — done: git log shows it. Mark each step done with evidence and end with LOOP_DONE.';
const CONCURRENT_GOAL =
  'Create the file notes/b.txt in this repository. STEP 1 — first run exactly this command to wait 25 seconds: ' +
  'node -e "setTimeout(() => {}, 25000)" — done: the command returned. STEP 2 — create notes/b.txt containing the single line B and commit ONLY that file ' +
  '(git add notes/b.txt) with the message "subagent: b" — done: git log shows it. Mark each step done with evidence and end with LOOP_DONE.';
const PARENT_LOOP_GOAL = 'Reply with exactly one line: PARENT LOOP OK. Do not read, create or modify any file.';

const EXPECTED = [
  'preconditions: a seed turn completes (CLI probe) and becomes the main conversation; the main dock tab is bound to it',
  'one writer: while the writer subagent\'s turn runs, a parent chat send is refused 409 subagent-busy AND the parent\'s own armed drive loop never runs at the same moment',
  'while the subagent\'s transcript is the newest in the folder, GET /api/main-conversation still names the parent\'s seed conversation; the picker marks one main and names the subagent session',
  'pointing the main dock tab at the subagent\'s conversation, or at a side conversation, leaves the main pointer unchanged; "make main" refuses a subagent conversation',
  'a side conversation started in a second dock tab never moves the pointer',
  'the subagent\'s summary is a turn in the MAIN conversation and the pointer names the session it ran in',
  'after a restart the pointer is unchanged; with main-conversations.json deleted, the restart re-seeds it from the main dock tab',
  'a concurrent writer subagent runs while the parent\'s chat send is accepted (both busy at once)',
];

if (L.describing) {
  L.describeAndExit({
    id: 'subagents',
    title: 'Repo-agent subagents — the main conversation and the one-writer rule hold',
    loop: { kind: 'goal (subagents + one parent loop)', mode: 'drive', maxIterations: 4, deadlineMinutes: DEADLINE / 60_000, deadlineEnv: 'LOOPEVAL_SUBAGENTS_MINUTES', goal: WRITER_GOAL, prompts: [CONCURRENT_GOAL, PARENT_LOOP_GOAL], denyList: null, verifyEnabled: null },
    fixture: { ...L.fixtureFacts('goal'), summary: 'the goal fixture as a plain repo the parent and its subagents share', workingCopy: 'template copied into a scratch root, git-inited; registered as "loopeval-subagents"; torn down after the run' },
    expected: EXPECTED,
  });
}

const V = new L.Verdicts('subagents');
const jsonOut = L.argValue('--json');
let ctx = null;

const runs = async () => (await L.api('GET', '/api/runs')).json || {};
const mainOf = async (repoId) => (await L.api('GET', '/api/main-conversation', undefined, { 'X-Repo-Id': repoId })).json?.sessionId || null;
const sessions = async (repoId) => (await L.api('GET', '/api/sessions', undefined, { 'X-Repo-Id': repoId })).json || [];
const subView = async (id) => (await L.api('GET', `/api/subagents/${id}`)).json;
const startSub = async (repoId, tabId, goal, extra = {}) => (await L.api('POST', '/api/subagents', { repoId, tabId, goal, maxIterations: 4, ...extra })).json;

async function waitFor(pred, ms, tick = 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await L.sleep(tick); }
  return null;
}

async function restart(dropPointer) {
  L.say(`restarting the instance${dropPointer ? ' with main-conversations.json removed (an older build\'s datadir)' : ''}`);
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(ctx.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-ctx.pid, 'SIGKILL'); } catch { /* */ } }
  await L.waitForDown?.();
  for (let i = 0; i < 20 && await L.health(); i++) await L.sleep(500);
  if (dropPointer) rmSync(join(ctx.datadir, 'main-conversations.json'), { force: true });
  await L.boot(ctx);
  await L.login();
}

try {
  if (L.CFG.live) { V.assert('isolated mode', false, 'the subagents scenario restarts its own instance — run it isolated (no --live)'); throw new L.Abort(); }
  await L.buildOnce();
  ctx = await L.provision('goal');
  await L.boot(ctx);
  await L.login();
  const repoId = await L.registerRepo(ctx.fixtureRepo, 'loopeval-subagents');
  const mainTab = await L.createTab(repoId, 'loopeval-subagents');

  // ---- preconditions: the seed turn becomes main ----------------------------------------------
  const seed = await L.seedTurn(repoId);
  if (!V.assert('seed turn completes (CLI probe)', seed.ok, JSON.stringify(seed.run))) throw new L.Abort();
  const seedSession = seed.run.sessionId;
  await L.bindTabSession(mainTab, seedSession);
  if (!V.assert('the seed conversation is the main one', (await mainOf(repoId)) === seedSession, `main=${await mainOf(repoId)} seed=${seedSession}`)) throw new L.Abort();

  // ---- 1+2: a writer subagent; the parent's chat AND its own loop must wait ------------------------
  const w = await startSub(repoId, mainTab, WRITER_GOAL, { name: 'writer-a' });
  if (!V.assert('writer subagent started', w?.ok && w.subagent?.id, JSON.stringify(w).slice(0, 300))) throw new L.Abort();
  const wKey = w.subagent.key;
  const wRunning = await waitFor(async () => (await runs())[wKey]?.status === 'running', L.minutes(2));
  if (!V.assert('the writer subagent\'s turn starts', !!wRunning)) throw new L.Abort();

  const chat = await L.api('POST', '/api/chat', { message: 'Reply with the single word: hi.', sessionId: seedSession }, { 'X-Repo-Id': repoId }, 4000).catch(() => ({ status: 0, json: null }));
  V.assert('one writer: the parent\'s chat send is refused 409 subagent-busy', chat.status === 409 && chat.json?.code === 'subagent-busy', `http ${chat.status} ${JSON.stringify(chat.json || {}).slice(0, 200)}`);

  const arm = await L.api('POST', '/api/autopilot/loop', { repoId, action: 'start', kind: 'goal', mode: 'drive', maxIterations: 2, goal: PARENT_LOOP_GOAL, sessionId: seedSession });
  V.assert('a parent drive loop is armed while the writer runs', arm.status === 200, `http ${arm.status}`);
  let overlap = 0, samples = 0, sawNewestSub = null;
  while ((await runs())[wKey]?.status === 'running') {
    const r = await runs();
    samples++;
    if (r[wKey]?.status === 'running' && r[repoId]?.status === 'running') overlap++;
    if (!sawNewestSub) {
      const list = await sessions(repoId);
      const newest = [...list].sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))[0];
      if (newest?.subagent) sawNewestSub = { newest: newest.id, main: await mainOf(repoId), list };
    }
    await L.sleep(500);
  }
  V.assert('one writer: the parent\'s own loop never runs while the writer subagent\'s turn runs', samples > 5 && overlap === 0, `${overlap} overlapping sample(s) of ${samples}`);

  // ---- 2: the newest file is the subagent's; main is not ---------------------------------------
  if (!sawNewestSub) {
    const list = await sessions(repoId);
    const newest = [...list].sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))[0];
    if (newest?.subagent) sawNewestSub = { newest: newest.id, main: await mainOf(repoId), list };
  }
  V.assert('the subagent\'s transcript was the newest in the folder (the condition under test)', !!sawNewestSub, 'never observed');
  V.assert('…and the main pointer still named the parent\'s conversation', sawNewestSub && sawNewestSub.main === seedSession && sawNewestSub.main !== sawNewestSub.newest, JSON.stringify(sawNewestSub && { newest: sawNewestSub.newest, main: sawNewestSub.main }));
  V.assert('the picker marks one main and names the subagent session', sawNewestSub && sawNewestSub.list.filter((s) => s.isMain).length === 1 && sawNewestSub.list.some((s) => s.subagent?.id === w.subagent.id), JSON.stringify(sawNewestSub?.list?.map((s) => ({ id: s.id.slice(0, 8), main: s.isMain, sub: s.subagent?.id }))));

  // ---- 3: picking another conversation in the main tab does not make it main ----------------------
  const subSession = (await sessions(repoId)).find((s) => s.subagent?.id === w.subagent.id)?.id;
  await L.api('PATCH', `/api/dock/${mainTab}`, { sessionId: subSession });
  V.assert('picking the subagent\'s conversation in the main tab leaves main unchanged', (await mainOf(repoId)) === seedSession, `main=${await mainOf(repoId)} sub=${subSession}`);
  const mk = await L.api('POST', '/api/main-conversation', { sessionId: subSession }, { 'X-Repo-Id': repoId });
  V.assert('"make main" refuses a subagent conversation', mk.status >= 400 && (await mainOf(repoId)) === seedSession, `http ${mk.status} ${JSON.stringify(mk.json || {}).slice(0, 200)}`);
  await L.api('PATCH', `/api/dock/${mainTab}`, { sessionId: seedSession });

  // stop the parent loop (it has done its job: proving it waited) before more turns are spent
  await L.api('POST', '/api/autopilot/loop', { repoId, action: 'stop' });

  // ---- 5: the summary lands in the main conversation -----------------------------------------------
  const delivered = await waitFor(async () => { const v = await subView(w.subagent.id); return v?.summaryDelivered && (await runs())[repoId]?.status !== 'running' ? v : null; }, DEADLINE, 3000);
  V.assert('the writer subagent ended done and its summary was delivered', delivered?.state === 'done', JSON.stringify(delivered && { state: delivered.state, outcome: delivered.outcome }));
  const mainNow = await mainOf(repoId);
  const ranIn = (await runs())[repoId]?.sessionId;
  const msgs = (await L.api('GET', `/api/sessions/${mainNow}/messages`, undefined, { 'X-Repo-Id': repoId })).json || [];
  const summaryMsg = (Array.isArray(msgs) ? msgs : msgs.messages || []).find((m) => m.role === 'user' && /\[subagent [0-9a-f]{8} "writer-a"/.test(m.text || ''));
  V.assert('the summary is a turn in the MAIN conversation, and the pointer names the session it ran in', !!summaryMsg && mainNow === ranIn, `main=${mainNow} ranIn=${ranIn} summary=${!!summaryMsg}`);
  const mainAfterSummary = mainNow;

  // ---- 4: a side conversation in a second tab never moves the pointer ---------------------------
  const sideTab = await L.createTab(repoId, 'loopeval-subagents (side)');
  await L.api('POST', '/api/chat', { message: 'Reply with the single word: side.' }, { 'X-Repo-Id': repoId }, 4000).catch(() => null);
  const side = await waitFor(async () => { const r = (await runs())[repoId]; return r && r.status !== 'running' ? r : null; }, L.minutes(3), 2000);
  const sideSession = side?.sessionId;
  if (sideSession) await L.api('PATCH', `/api/dock/${sideTab}`, { sessionId: sideSession });
  V.assert('a side conversation in a second tab does not move the pointer', !!sideSession && sideSession !== mainAfterSummary && (await mainOf(repoId)) === mainAfterSummary, `side=${sideSession} main=${await mainOf(repoId)}`);
  await L.api('PATCH', `/api/dock/${mainTab}`, { sessionId: sideSession });
  V.assert('picking the side conversation in the main tab leaves main unchanged', (await mainOf(repoId)) === mainAfterSummary, `main=${await mainOf(repoId)}`);
  await L.api('PATCH', `/api/dock/${mainTab}`, { sessionId: mainAfterSummary });
  const mk2 = await L.api('POST', '/api/main-conversation', { sessionId: sideSession }, { 'X-Repo-Id': repoId });
  V.assert('"make main" on a side conversation is the one way to move it', mk2.status === 200 && (await mainOf(repoId)) === sideSession, `http ${mk2.status}`);
  await L.api('POST', '/api/main-conversation', { sessionId: mainAfterSummary }, { 'X-Repo-Id': repoId });

  // ---- 6: restart keeps it; an older build's datadir re-seeds it from the main dock tab ------------
  await restart(false);
  V.assert('after a restart the pointer is unchanged', (await mainOf(repoId)) === mainAfterSummary, `main=${await mainOf(repoId)}`);
  await restart(true);
  V.assert('with the pointer file gone, the restart re-seeds it from the main dock tab (not the newest file)', (await mainOf(repoId)) === mainAfterSummary, `main=${await mainOf(repoId)} expected=${mainAfterSummary}`);

  // ---- 7: a concurrent writer runs alongside the parent ---------------------------------------------
  const c = await startSub(repoId, mainTab, CONCURRENT_GOAL, { name: 'concurrent-b', concurrent: true });
  if (!V.assert('concurrent writer subagent started', c?.ok && c.subagent?.concurrent, JSON.stringify(c).slice(0, 300))) throw new L.Abort();
  const cRunning = await waitFor(async () => (await runs())[c.subagent.key]?.status === 'running', L.minutes(2));
  // The parent's turn is made to last (a 10 s wait), the send is NOT awaited, and polling starts at
  // once — a one-word turn can finish inside the request's own window and hide the overlap (run 2).
  const chat2P = cRunning
    ? L.api('POST', '/api/chat', { message: 'Run exactly this command and wait for it: node -e "setTimeout(() => {}, 10000)" — then reply with the single word: alongside. Do not create or modify any file.', sessionId: mainAfterSummary }, { 'X-Repo-Id': repoId }, 4000).catch(() => ({ status: 200 }))
    : Promise.resolve({ status: 0 });
  const both = cRunning && await waitFor(async () => { const r = await runs(); return r[c.subagent.key]?.status === 'running' && r[repoId]?.status === 'running'; }, 30_000, 200);
  const chat2 = await chat2P;
  V.assert('a concurrent writer: the parent\'s chat send is accepted and both run at once', chat2.status !== 409 && !!both, `http ${chat2.status} both=${!!both}`);
  await L.api('POST', `/api/subagents/${c.subagent.id}/stop`, {});
  await waitFor(async () => { const r = await runs(); return r[repoId]?.status !== 'running' && r[c.subagent.key]?.status !== 'running'; }, L.minutes(3), 2000);
} catch (e) {
  if (!(e instanceof L.Abort)) V.assert('scenario ran to the end', false, e?.stack || String(e));
} finally {
  await L.down(ctx);
}
process.exitCode = L.finish(V, jsonOut);
