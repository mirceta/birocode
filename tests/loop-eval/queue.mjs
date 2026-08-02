// Queue-loop eval scenario (openspec: add-loop-eval-suite, spec loop-eval).
//
// Proves the REAL queue loop drains a REAL six-prompt stash correctly: each
// prompt asks the agent for a small, mechanically checkable artifact
// (fixtures/queue/expected.json is the ground truth). The loop must advance
// through all six in order (step → STEP_VERIFIED verify → next), resolve
// done · drained with queueSent == 6, and every artifact must exist and match.
//
//   node tests/loop-eval/queue.mjs [--json out.json] [--live]
//
// --live (add-loop-eval-live-mode): same scenario against the running :5099
// harness, watchable in the real UI. Needs LOOPEVAL_LIVE_PW + gate/kill
// switch already on. Default stays the fully-automatic isolated instance.
//
// Spends real Claude turns (typically 12: 6 steps + 6 verifies) and real
// minutes. Never CI.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPECTED = JSON.parse(readFileSync(join(HERE, 'fixtures', 'queue', 'expected.json'), 'utf8'));

const MAX_ITERATIONS = 18; // 6 steps + 6 verifies = 12 sends minimum; headroom for re-proposals
const DEADLINE = L.minutes(Number(process.env.LOOPEVAL_QUEUE_MINUTES || 25));
const DENY_LIST = ['reset --hard', 'force-push'];

// The assertion contract, human-readable — kept adjacent to the constants
// above so a change to the ladder below is reviewed next to this list
// (openspec: loop-eval-scenario-transparency, design D2).
const EXPECTED_OUTCOME = [
  'preconditions: no expected artifact pre-exists on the fixture (drift guard) and a seeded chat turn completes (CLI probe) — else abort before spending tokens',
  'loop resolves before the deadline',
  'loop ends done · drained — no escalation, no error',
  `all ${EXPECTED.length} prompts are sent (queueSent == ${EXPECTED.length}), in arm order`,
  'every expected artifact exists and matches its pattern',
];

// --describe: manifest from the same constants the run below uses, then exit —
// before any build, provisioning, network call, or token spend.
if (L.describing) {
  L.describeAndExit({
    id: 'queue',
    title: 'Queue loop — drain 6 prompts correctly',
    loop: {
      kind: 'queue',
      mode: 'drive',
      maxIterations: MAX_ITERATIONS,
      deadlineMinutes: DEADLINE / 60_000,
      deadlineEnv: 'LOOPEVAL_QUEUE_MINUTES',
      goal: null,
      prompts: EXPECTED, // {prompt, path, pattern} — fixtures/queue/expected.json verbatim
      denyList: DENY_LIST,
      verifyEnabled: true,
    },
    fixture: {
      ...L.fixtureFacts('queue'),
      summary: 'empty "qmath" library skeleton (CLAUDE.md + README only) — every expected artifact must be absent until its prompt produces it',
      workingCopy: 'template copied to a scratch dir, git-inited with an initial commit, registered as a repo card ("loopeval-queue", live mode: "loopeval-queue-live"), torn down after the run',
    },
    expected: EXPECTED_OUTCOME,
  });
}

const V = new L.Verdicts('queue');
const jsonOut = L.argValue('--json');
let ctx = null;

try {
  await L.buildOnce();
  ctx = await L.provision('queue');

  // Fixture-drift guard: every expected artifact must be ABSENT (or not yet
  // matching) on the fresh fixture, or the scenario proves nothing.
  const drifted = EXPECTED.filter((e) => {
    const p = join(ctx.fixtureRepo, e.path);
    return existsSync(p) && new RegExp(e.pattern).test(readFileSync(p, 'utf8'));
  });
  if (!V.assert('precondition: no expected artifact pre-exists on the fixture',
    drifted.length === 0, drifted.map((e) => e.path).join(', ')))
    throw new L.Abort('fixture drift');

  await L.boot(ctx);
  await L.login();
  if (!(await L.livePreflight(V))) throw new L.Abort('live preflight failed');
  const repoName = L.repoDisplayName('loopeval-queue');
  const repoId = await L.registerRepo(ctx.fixtureRepo, repoName);
  const tabId = await L.createTabWithStash(repoId, repoName, EXPECTED.map((e) => e.prompt));

  const seed = await L.seedTurn(repoId);
  if (!V.assert('CLI probe: seeded chat turn completed', seed.ok, JSON.stringify(seed.run || {})))
    throw new L.Abort('claude CLI is not working on this box — aborting before arming');

  // Watchable dock (openspec: loop-eval-watchable-dock): bind the stash tab to
  // the seed session and arm pinned to that SAME session, so opening the dock
  // shows the seeded conversation immediately, then every drained prompt.
  await L.bindTabSession(tabId, seed.run?.sessionId);

  const arm = await L.api('POST', '/api/autopilot/loop', {
    repoId, action: 'start', kind: 'queue', tabId, mode: 'drive',
    verifyEnabled: true, maxIterations: MAX_ITERATIONS,
    denyList: DENY_LIST,
    sessionId: seed.run?.sessionId || undefined,
  });
  if (!V.assert('queue loop armed', arm.status === 200, `http ${arm.status} ${JSON.stringify(arm.json || {}).slice(0, 300)}`))
    throw new L.Abort('arm failed');
  L.announceWatch(repoName);

  const { loop, timedOut } = await L.watchLoop(repoId, { deadlineMs: DEADLINE });
  V.assert(`loop resolved before the ${DEADLINE / 60000}-minute deadline`, !timedOut,
    JSON.stringify(loop || {}));
  V.assert('loop ended done · drained (no escalation, no error)',
    loop?.status === 'done' && loop?.stopReason === 'drained',
    `status=${loop?.status} reason=${loop?.stopReason} detail=${loop?.stopDetail}`);
  V.assert('all six prompts were sent (queueSent == 6)',
    loop?.queueSent === 6, `queueSent=${loop?.queueSent} remaining=${loop?.queueRemaining}`);

  // Sent order: QueueSentTexts is the only place the full prompt texts land.
  // The lib reads it per mode (isolated: parse loops.json — System.Text.Json
  // escapes backticks/quotes, never substring-match; live: the debug bundle).
  const sentTexts = await L.queueSentTexts(ctx, repoId);
  V.assert('sent texts appear in arm order',
    sentTexts.length === EXPECTED.length && EXPECTED.every((e, i) => sentTexts[i] === e.prompt),
    JSON.stringify(sentTexts).slice(0, 300));

  // The property no cheap test can see: each prompt produced its artifact.
  for (const e of EXPECTED) {
    const p = join(ctx.fixtureRepo, e.path);
    const ok = existsSync(p) && new RegExp(e.pattern).test(readFileSync(p, 'utf8'));
    V.assert(`artifact ${e.path} matches /${e.pattern}/`, ok,
      existsSync(p) ? readFileSync(p, 'utf8').slice(0, 200) : 'file missing');
  }
} catch (e) {
  if (!(e instanceof L.Abort)) V.assert('scenario ran to completion', false, e?.stack || String(e));
} finally {
  await L.captureDiagnostics(ctx, V).catch(() => {});
  await L.down(ctx).catch(() => {});
}

process.exitCode = L.finish(V, jsonOut);
