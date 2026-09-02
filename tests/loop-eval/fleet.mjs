// Fleet arch-agent eval scenario (openspec: add-fleet-arch-agent, D7 — the ship gate).
//
// Two ISOLATED harness instances on this one box: A (the loop-eval instance,
// :5210) hosts the fleet arch; B (:5211, its own bin copy + datadir) hosts a
// goal-fixture repo agent. A subscribes to B's event feed with B's password and
// the operator marks the source "allow sends"; B's operator sets "accept fleet
// sends". A's arch agent is scoped to B's repo, armed in drive mode, and told to
// get B's goal check green. Everything then crosses the wire: A's fleet client
// POSTs the task to B's peer API, B runs the turn with actor arch@<A>, B's
// turn.ended reaches A through the collector, and A's arch wakes.
//
//   node tests/loop-eval/fleet.mjs [--json out.json]
//
// Isolated only (no --live): a live fleet run is the Operator's own two-machine
// test after deploying this build to the second box. Spends real Claude turns
// (2–4 arch + 1–2 repo) and real minutes. Never CI.

import { existsSync, readFileSync, mkdirSync, cpSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as L from './lib.mjs';

const PEER_PORT = Number(process.env.LOOPEVAL_PEER_PORT || 5211);
const PEER_LABEL = 'peer-b';
const MAX_ARCH_ITERATIONS = 6;
const DEADLINE = L.minutes(Number(process.env.LOOPEVAL_FLEET_MINUTES || 18));

const TASK =
  'Implement the missing `done` command of todo.mjs in this repository (see CLAUDE.md for the contract) ' +
  'so that `node goal-check.mjs` exits 0 and prints ALL CHECKS PASS. Commit your work. Do not push. ' +
  'End your reply with one line: STATUS: done, or STATUS: blocked <why>.';

const instructionFor = (repoName) =>
  `The repository "${repoName}" you manage lives on the machine "${PEER_LABEL}", not on this harness. ` +
  `Call list_agents to confirm it is available there, then send it exactly this task with send_task, ` +
  `passing machine "${PEER_LABEL}": "${TASK}" ` +
  'Then stop and wait: the harness wakes you when that repo\'s turn ends (its events reach you through the feed). ' +
  `On the wake-up, call read_transcript with machine "${PEER_LABEL}" for that repo; if its last reply says STATUS: done, ` +
  'remember that in memory/fleet.md and reply with the single line ALL_DONE. Never retry a busy repo and never order a push.';

const EXPECTED_OUTCOME = [
  'preconditions: goal-check FAILS on the untouched B fixture; a seeded chat turn completes on B (CLI probe); B refuses a peer send before its operator opts in (not-accepting)',
  `A sees B through the peer API (status ok, B's repo offered) once B is a subscribed source with sends allowed`,
  `A's arch agent, told once by the Operator, gets goal-check.mjs to exit 0 on B's repo before the deadline, within the cap (≤ ${MAX_ARCH_ITERATIONS} arch turns)`,
  `B's audit carries the send as kind arch with the fleet phase, and B's dock transcript shows a user bubble tagged arch@<A's label>`,
  `A's collector carried B's turn.ended, an arch.wake followed it on A, and A's audit carries the fleet send under the ${PEER_LABEL}/<repo> key`,
  'both scratch instances are torn down',
];

if (L.describing) {
  L.describeAndExit({
    id: 'fleet',
    title: 'Fleet arch agent — drive a repo agent on a second harness',
    loop: {
      kind: 'arch',
      mode: 'drive',
      maxIterations: MAX_ARCH_ITERATIONS,
      deadlineMinutes: DEADLINE / 60_000,
      deadlineEnv: 'LOOPEVAL_FLEET_MINUTES',
      goal: instructionFor('<repo on peer-b>'),
      prompts: null,
      denyList: null,
      verifyEnabled: null,
    },
    fixture: {
      ...L.fixtureFacts('goal'),
      summary: 'one copy of the goal fixture registered on a SECOND isolated harness (B, :5211); A (:5210) hosts the fleet arch, subscribes to B, and is scoped to B\'s repo only',
      workingCopy: 'B\'s scratch lives under A\'s scratch root (bin copy + datadir + fixture); torn down with it',
    },
    expected: EXPECTED_OUTCOME,
  });
}

if (L.CFG.live) {
  console.error('fleet.mjs is isolated-only: a live fleet run is the Operator\'s two-machine test (deploy this build to the second box, subscribe it, allow + accept sends, scope the Arch tab).');
  process.exit(2);
}

const V = new L.Verdicts('fleet');
const jsonOut = L.argValue('--json');
let ctx = null;
let peer = null;
let archArmed = false;

// ---- the peer instance (B) ---------------------------------------------------

const peerBase = () => `http://localhost:${PEER_PORT}`;

async function peerApi(method, path, body, extraHeaders = {}, timeoutMs = 0) {
  const ctl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(peerBase() + path, {
      method,
      headers: { 'content-type': 'application/json', 'X-Auth-Password': L.CFG.pw, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    let json = null;
    try { json = await r.json(); } catch { /* SSE or empty */ }
    return { status: r.status, json };
  } finally { if (timer) clearTimeout(timer); }
}

async function bootPeer(root) {
  if (await L.health(peerBase())) throw new Error(`something already answers on ${peerBase()} — stop it (or set LOOPEVAL_PEER_PORT) first`);
  const datadir = join(root, 'datadir');
  mkdirSync(datadir, { recursive: true });
  cpSync(join(ctx.root, 'bin'), join(root, 'bin'), { recursive: true });
  writeFileSync(join(datadir, 'autopilot-gate.json'), JSON.stringify({ enabled: true }));
  writeFileSync(join(datadir, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: true, Threshold: 0.85, ArmedRepoIds: [],
    DenyList: ['reset --hard', 'force-push'], Brain: 'cli', BrainModel: 'haiku',
  }, null, 2));
  L.say(`launching peer ClaudeWeb on ${peerBase()} (isolated datadir)`);
  const exe = join(root, 'bin', process.platform === 'win32' ? 'ClaudeWeb.exe' : 'ClaudeWeb');
  const child = spawn(exe, [], {
    cwd: join(root, 'bin'), detached: true, stdio: 'ignore',
    env: { ...process.env, CLAUDEWEB_DATADIR: datadir, CLAUDEWEB_Port: String(PEER_PORT), CLAUDEWEB_AuthPassword: L.CFG.pw },
  });
  child.unref();
  const p = { root, datadir, pid: child.pid };
  for (let i = 0; i < 60; i++) { if (await L.health(peerBase())) { L.say(`peer healthy (pid ${p.pid})`); return p; } await L.sleep(1000); }
  throw new Error(`peer never became healthy on ${peerBase()}`);
}

function killPeer() {
  if (!peer?.pid) return;
  if (L.CFG.keep) { L.say(`LOOPEVAL_KEEP=1 — leaving peer up (pid ${peer.pid}, root ${peer.root})`); return; }
  L.say(`tearing down peer (pid ${peer.pid})`);
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(peer.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(peer.pid, 'SIGKILL'); } catch { /* */ } }
}

async function peerRunState(repoId) { return (await peerApi('GET', '/api/runs')).json?.[repoId] || null; }

async function peerSeedTurn(repoId) {
  L.say('seeding a conversation on the peer (CLI probe)…');
  await peerApi('POST', '/api/chat', { message: 'Reply with the single word: ready. Do not touch any files.' }, { 'X-Repo-Id': repoId }, 4000)
    .catch(() => { /* drop the SSE attachment fast */ });
  for (let i = 0; i < 60; i++) {
    await L.sleep(3000);
    const run = await peerRunState(repoId);
    if (run && run.status !== 'running') return { ok: run.status === 'done', run };
  }
  return { ok: false, run: { status: 'timeout' } };
}

function peerAudit(repoId) {
  const p = join(peer.datadir, 'autopilot-audit.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.RepoId === repoId);
}

async function peerTranscript(repoId) {
  const tabs = (await peerApi('GET', '/api/dock')).json || [];
  const sid = tabs.find((t) => t.repoId === repoId && t.sessionId)?.sessionId;
  if (!sid) return [];
  return (await peerApi('GET', `/api/sessions/${sid}/messages`, undefined, { 'X-Repo-Id': repoId })).json || [];
}

function peerLogTail() {
  try {
    const logs = join(peer.root, 'bin', 'logs');
    const newest = readdirSync(logs).map((f) => join(logs, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    return newest ? readFileSync(newest, 'utf8').split(/\r?\n/).slice(-60).join('\n') : '';
  } catch { return ''; }
}

// ---- A-side helpers ------------------------------------------------------------

async function archState() { return (await L.api('GET', '/api/arch')).json; }

function auditA(key) {
  const p = join(ctx.datadir, 'autopilot-audit.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.RepoId === key);
}

async function collectorEvents() { return (await L.api('GET', '/api/collector/events?after=0')).json?.events || []; }

// ---- the scenario ---------------------------------------------------------------

try {
  await L.buildOnce();
  ctx = await L.provision('goal'); // A's scratch (its own fixture copy stays unregistered — the point is the remote one)
  const peerRoot = join(ctx.root, 'peer');
  mkdirSync(peerRoot, { recursive: true });
  const B = L.materializeFixtureAs(peerRoot, 'goal', 'fixture-b');
  const pre = L.runNode('goal-check.mjs', B);
  if (!V.assert('precondition: goal-check FAILS on the untouched B fixture', pre.status !== 0, pre.out)) throw new L.Abort('fixture drift');

  await L.boot(ctx);
  await L.login();
  peer = await bootPeer(peerRoot);

  // B: its repo + a seeded conversation (CLI probe), and a dock tab bound to it.
  const repoName = 'loopeval-fleet-b';
  const reg = await peerApi('POST', '/api/repos', { Folder: B, Name: repoName, Visibility: 'advanced' });
  if (!V.assert('B: fixture repo registered', !!reg.json?.id, `http ${reg.status} ${JSON.stringify(reg.json || {})}`)) throw new L.Abort('peer registration failed');
  const repoIdB = reg.json.id;
  const seed = await peerSeedTurn(repoIdB);
  if (!V.assert('B: CLI probe — seeded chat turn completed', seed.ok, JSON.stringify(seed.run || {}))) throw new L.Abort('claude CLI is not working on this box');
  const tab = await peerApi('POST', '/api/dock', { repoId: repoIdB, repoName });
  if (tab.json?.id && seed.run?.sessionId) await peerApi('PATCH', `/api/dock/${tab.json.id}`, { sessionId: seed.run.sessionId });

  // B refuses fleet sends until its operator opts in.
  const early = await peerApi('POST', '/api/arch/peer/send', { repoId: repoIdB, text: 'Reply with the word pong.', from: 'probe' });
  V.assert('B: peer send before opt-in is refused with not-accepting', early.status === 200 && early.json?.status === 'not-accepting', `http ${early.status} ${JSON.stringify(early.json || {})}`);
  const accept = await peerApi('POST', '/api/arch/fleet', { acceptSends: true });
  V.assert('B: accept fleet sends set', accept.status === 200 && accept.json?.fleet?.acceptSends === true, `http ${accept.status}`);
  const describe = await peerApi('GET', '/api/arch/peer');
  V.assert('B: peer describe lists its repo with availability', describe.status === 200 && describe.json?.protocol === 1
    && (describe.json?.repos || []).some((r) => r.repoId === repoIdB && r.availability === 'available'),
    `http ${describe.status} ${JSON.stringify(describe.json || {}).slice(0, 300)}`);

  // A: subscribe to B (feed credential = B's password), then allow sends.
  const add = await L.api('POST', '/api/collector/sources', { address: peerBase(), label: PEER_LABEL, credential: L.CFG.pw });
  if (!V.assert('A: B registered as a collector source (feed active)', add.status === 200 && add.json?.status === 'active', `http ${add.status} ${JSON.stringify(add.json || {})}`)) throw new L.Abort('subscribe failed');
  const srcId = add.json.id;
  let st = await archState();
  const srcBefore = (st?.fleet?.sources || []).find((s) => s.id === srcId);
  V.assert('A: peer API ok and sends NOT yet allowed right after subscribing',
    srcBefore?.peer?.status === 'ok' && srcBefore?.allowSends === false && srcBefore?.peer?.acceptsSends === true,
    JSON.stringify(srcBefore?.peer || {}));
  const allow = await L.api('POST', `/api/collector/sources/${srcId}/sends`, { allow: true });
  V.assert('A: allow sends set on the source', allow.status === 200 && allow.json?.allowSends === true, `http ${allow.status}`);
  st = await archState();
  const srcAfter = (st?.fleet?.sources || []).find((s) => s.id === srcId);
  V.assert(`A: B's repo is offered for scope through the peer describe`, (srcAfter?.repos || []).some((r) => r.repoId === repoIdB), JSON.stringify(srcAfter?.repos || []).slice(0, 300));

  // A: scope = B's repo only; arm; instruct.
  const key = `${srcId}/${repoIdB}`;
  const scope = await L.api('POST', '/api/arch/scope', { repoIds: [], fleet: [key] });
  const agent = (scope.json?.agents || []).find((a) => a.key === key);
  if (!V.assert(`A: scope holds B's repo as machine ${PEER_LABEL}, available`, scope.status === 200 && agent?.machine === PEER_LABEL && agent?.availability === 'available' && agent?.isLocal === false,
    `http ${scope.status} ${JSON.stringify(scope.json?.agents || [])}`)) throw new L.Abort('scope failed');

  const arm = await L.api('POST', '/api/arch/loop', { action: 'arm', mode: 'drive', maxIterations: MAX_ARCH_ITERATIONS });
  if (!V.assert('A: arch loop armed (drive)', arm.status === 200 && arm.json?.loop?.active === true, `http ${arm.status}`)) throw new L.Abort('arm failed');
  archArmed = true;
  const pf = (await L.api('GET', '/api/arch/tools/preflight')).json;
  V.assert('A: tools preflight is ready with the fleet row passing', pf?.ready === true && (pf?.checks || []).some((c) => c.id === `fleet:${srcId}` && c.ok), JSON.stringify(pf?.checks || []));

  const sent = await L.api('POST', '/api/arch/send', { text: instructionFor(repoName) });
  if (!V.assert('A: operator instruction delivered to the arch agent', sent.status === 200, `http ${sent.status} ${JSON.stringify(sent.json || {})}`)) throw new L.Abort('send failed');
  L.say(`→ A: ${L.base()}/studio/arch · B: ${peerBase()}/studio`);

  const t0 = Date.now();
  let green = false;
  while (Date.now() - t0 < DEADLINE) {
    await L.sleep(5000);
    st = await archState();
    const agents = st?.agents || [];
    const ok = L.runNode('goal-check.mjs', B).status === 0;
    const remoteBusy = agents.some((x) => x.availability === 'busy') || (await peerRunState(repoIdB))?.status === 'running';
    const archBusy = st?.session?.run?.status === 'running';
    L.say(`loop status=${st?.loop?.status} iter=${st?.loop?.iterationsDone} archRun=${st?.session?.run?.status ?? '-'} · ${agents.map((x) => `${x.machine}/${x.name}:${x.availability}`).join(' ')} · green=${ok}`);
    if (ok && !remoteBusy && !archBusy) { green = true; break; }
    if (st?.loop && !st.loop.active) break;
  }
  V.assert(`goal check exits 0 on B's repo before the ${DEADLINE / 60000}-minute deadline`, green,
    `goal=${L.runNode('goal-check.mjs', B).status} loop=${JSON.stringify(st?.loop || {})}`);
  V.assert(`arch turns within cap (<= ${MAX_ARCH_ITERATIONS})`, (st?.loop?.iterationsDone ?? 99) <= MAX_ARCH_ITERATIONS, `iterationsDone=${st?.loop?.iterationsDone}`);

  // Provenance on B: its own audit row + the tagged bubble.
  const bAudit = peerAudit(repoIdB);
  const bSends = bAudit.filter((e) => e.Outcome === 'arch');
  V.assert('B: the send is audited as kind arch with the fleet phase', bSends.length > 0 && bSends.every((e) => e.Kind === 'arch' && String(e.Phase || '').startsWith('fleet:')),
    bSends.map((e) => `${e.Kind}/${e.Phase}`).join(',') || 'no arch sends');
  const bMsgs = await peerTranscript(repoIdB);
  const tagged = bMsgs.filter((m) => m.role === 'user' && String(m.actor || '').startsWith('arch@'));
  V.assert(`B: dock transcript shows a user bubble tagged arch@<A's label>`, tagged.length > 0,
    bMsgs.filter((m) => m.role === 'user').map((m) => m.actor || 'human').join(','));
  V.assert('B: no loop-kind send touched the repo (only the fleet arch drove it)', !bAudit.some((e) => e.Outcome === 'loop'), '');

  // The wire on A: collector carried B's turn.ended; arch.wake followed; A audited the fleet send.
  const evs = await collectorEvents();
  const ended = evs.find((e) => e.type === 'turn.ended' && e.sourceLabel === PEER_LABEL && e.source?.repoId === repoIdB);
  V.assert(`A: collector carried B's turn.ended (source ${PEER_LABEL})`, !!ended, `types from ${PEER_LABEL}: ${evs.filter((e) => e.sourceLabel === PEER_LABEL).map((e) => e.type).join(',') || 'none'}`);
  const wake = evs.find((e) => e.type === 'arch.wake' && ended && e.seq > ended.seq);
  V.assert(`A: an arch.wake followed B's turn.ended and names the fleet key`, !!wake && (wake.data?.repoIds || []).includes(key),
    `wakes=${evs.filter((e) => e.type === 'arch.wake').length} data=${JSON.stringify(wake?.data || {})}`);
  const aSends = auditA(key).filter((e) => e.Outcome === 'arch');
  V.assert(`A: audit carries the fleet send under ${PEER_LABEL}/<repo> with the fleet phase`, aSends.length > 0 && aSends.every((e) => e.Kind === 'arch' && e.Phase === `fleet:${PEER_LABEL}`),
    aSends.map((e) => `${e.Kind}/${e.Phase}`).join(',') || 'no entries');
  const denied = [...auditA(key), ...bAudit].filter((e) => e.Outcome === 'arch-denied');
  V.assert('no deny fence fired on either side', denied.length === 0, `denied=${denied.length}`);
} catch (e) {
  if (!(e instanceof L.Abort)) V.assert('scenario ran to completion', false, e?.stack || String(e));
} finally {
  try { if (archArmed) await L.api('POST', '/api/arch/loop', { action: 'disarm' }); } catch { /* best effort */ }
  await L.captureDiagnostics(ctx, V).catch(() => {});
  if (peer) V.diagnostics = { ...(V.diagnostics || {}), peerLogTail: peerLogTail() };
  killPeer();
  await L.down(ctx).catch(() => {});
}

process.exitCode = L.finish(V, jsonOut);
