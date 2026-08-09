// Golden-example replay eval scenario (openspec: loop-evals, built on the
// loop-eval suite: add-loop-eval-suite / -live-mode / -ui-runner).
//
// Where goal.mjs and queue.mjs use hand-authored synthetic fixtures, this
// scenario replays a CAPTURED human-babysat task: a golden example packaged as
// a git bundle (tag eval/start · branch golden · tag eval/final) plus a
// manifest of acceptance checks and queue seed hints, authored by the curation
// UI (api/loop-evals). The scenario clones the bundle at eval/start with the
// golden answer stripped, seeds the REAL queue loop from plan.md through the
// shipped operator surface, lets real agent turns run, and scores:
//   • VERDICT   — every manifest acceptance check passes in the final tree
//                 (mechanical, not byte-identity) + the loop ended done.
//   • EVIDENCE  — trajectory: per-turn files-touched overlap vs the golden
//                 chain (reported, never a pass/fail — a correct run may
//                 validly diverge from how the human drove it).
//
//   node tests/loop-eval/golden.mjs [--json out.json] [--live] [--runs N]
//
// --live: same scenario against the running :5099 harness, watchable in the
//   real UI (repo card, dock turns, Autopilot loop card). Needs LOOPEVAL_LIVE_PW
//   + gate/kill switch already on. Runs a single (watchable) run.
// --runs N (ISOLATED only): reliability sweep — N runs against one booted
//   instance; reports pass-rate + iteration spread. Live mode is one run.
//
// Env: LOOPEVAL_GOLDEN_EXAMPLE (default hello-notes),
//   LOOPEVAL_GOLDEN_EXAMPLES_ROOT, LOOPEVAL_GOLDEN_MINUTES,
//   LOOPEVAL_GOLDEN_MAXITER, LOOPEVAL_GOLDEN_RUNS.
//
// Spends real Claude turns and real minutes. Never CI.

import { join } from 'node:path';
import * as L from './lib.mjs';

const EXAMPLE = process.env.LOOPEVAL_GOLDEN_EXAMPLE || 'hello-notes';
const RUNS = Math.max(1, Number(process.env.LOOPEVAL_GOLDEN_RUNS || L.argValue('--runs') || 1));
const MAX_ITERATIONS = Number(process.env.LOOPEVAL_GOLDEN_MAXITER || 18);
const DEADLINE = L.minutes(Number(process.env.LOOPEVAL_GOLDEN_MINUTES || 30));
const DENY_LIST = ['reset --hard', 'force-push'];

const { manifest } = L.readGoldenManifest(EXAMPLE);
const CHECKS = manifest.checks || [];
const SEED = manifest.loop?.seed || { mode: 'plan', items: [] };

// The assertion contract, human-readable — kept adjacent to the constants so a
// change to the ladder below is reviewed next to this list
// (openspec: loop-eval-scenario-transparency).
const EXPECTED_OUTCOME = [
  'preconditions: the acceptance checks do NOT already pass at eval/start (drift guard) and a seeded chat turn completes (CLI probe) — else abort before spending tokens',
  'loop resolves before the deadline',
  'loop ends done — no escalation, no error',
  'every manifest acceptance check passes in the loop\'s final working copy (the verdict)',
  'trajectory vs the golden chain is reported as evidence (never pass/fail)',
];

// --describe: manifest from the same constants the run below uses, then exit —
// before any build, provisioning, network call, or token spend. Built from the
// example manifest (no repo-template — the fixture is the git bundle).
if (L.describing) {
  L.describeAndExit({
    id: 'golden',
    title: `Golden-example replay — ${EXAMPLE}`,
    loop: {
      kind: 'queue', mode: 'drive', maxIterations: MAX_ITERATIONS,
      deadlineMinutes: DEADLINE / 60_000, deadlineEnv: 'LOOPEVAL_GOLDEN_MINUTES',
      goal: null, denyList: DENY_LIST, verifyEnabled: true,
    },
    fixture: {
      name: EXAMPLE,
      example: `tests/loop-evals/examples/${EXAMPLE}`,
      description: manifest.description || '',
      checks: CHECKS.map((c) => c.name),
      seedMode: SEED.mode,
      summary: 'a captured golden example: cloned from repo.bundle at eval/start with the golden answer stripped; the queue loop must reach a state where every acceptance check passes',
      workingCopy: 'bundle cloned to a scratch dir on a fresh "work" branch, registered as a repo card ("loopeval-golden", live mode: "loopeval-golden-live"), torn down after the run',
    },
    runs: RUNS,
    expected: EXPECTED_OUTCOME,
  });
}

// Reliability sweeps are an offline concern; live mode exists to WATCH one run.
if (L.CFG.live && RUNS > 1) {
  console.error('golden: --runs > 1 is isolated-mode only (live mode is for watching a single run). Drop --runs / LOOPEVAL_GOLDEN_RUNS for --live.');
  process.exit(2);
}

const V = new L.Verdicts('golden');
const jsonOut = L.argValue('--json');
let ctx = null;
const runReports = [];

/** One full replay against the already-booted instance: fresh working copy
 *  from the bundle → register → seed → arm queue loop → watch → score. */
async function runOnce(i, prefix) {
  const { fixtureRepo, startSha } = L.materializeGolden(ctx.root, ctx.bundle, `fixture-repo-${i}`);

  // Fixture-drift guard: the checks must NOT already pass at eval/start, or the
  // scenario proves nothing.
  const startChecks = L.runChecks(fixtureRepo, CHECKS);
  const allPassAtStart = startChecks.length > 0 && startChecks.every((c) => c.ok);
  if (!V.assert(`${prefix}precondition: acceptance checks do not already pass at eval/start (drift guard)`,
    !allPassAtStart, startChecks.map((c) => `${c.name}:${c.ok ? 'pass' : 'fail'}`).join(', ')))
    throw new L.Abort('fixture drift — the golden start state already satisfies the checks');

  const baseName = RUNS > 1 ? `loopeval-golden-${i}` : 'loopeval-golden';
  const repoName = L.repoDisplayName(baseName);
  const repoId = await L.registerRepo(fixtureRepo, repoName);

  // Seed hints: plan.md as one plan-sized queue item by default, or a pre-split
  // item list authored at curation time.
  const items = (SEED.mode === 'items' && Array.isArray(SEED.items) && SEED.items.length)
    ? SEED.items
    : [ctx.planText.trim() || `Complete the task described in plan.md for the "${EXAMPLE}" example. Commit your work.`];
  const tabId = await L.createTabWithStash(repoId, repoName, items);

  const seed = await L.seedTurn(repoId);
  if (!V.assert(`${prefix}CLI probe: seeded chat turn completed`, seed.ok, JSON.stringify(seed.run || {})))
    throw new L.Abort('claude CLI is not working on this box — aborting before arming');

  // Watchable dock (openspec: loop-eval-watchable-dock): bind the tab to the
  // seed session and arm pinned to it, so opening the dock shows the driven
  // conversation immediately.
  await L.bindTabSession(tabId, seed.run?.sessionId);

  const arm = await L.api('POST', '/api/autopilot/loop', {
    repoId, action: 'start', kind: 'queue', tabId, mode: 'drive',
    verifyEnabled: true, maxIterations: MAX_ITERATIONS, denyList: DENY_LIST,
    sessionId: seed.run?.sessionId || undefined,
  });
  if (!V.assert(`${prefix}queue loop armed`, arm.status === 200,
    `http ${arm.status} ${JSON.stringify(arm.json || {}).slice(0, 300)}`))
    throw new L.Abort('arm failed');
  if (i === 0) L.announceWatch(repoName);

  const { loop, timedOut } = await L.watchLoop(repoId, { deadlineMs: DEADLINE });
  V.assert(`${prefix}loop resolved before the ${DEADLINE / 60000}-minute deadline`, !timedOut,
    JSON.stringify(loop || {}));
  V.assert(`${prefix}loop ended done (no escalation, no error)`,
    loop?.status === 'done', `status=${loop?.status} reason=${loop?.stopReason} detail=${loop?.stopDetail}`);

  // PRIMARY VERDICT: the property no cheap test can see — the loop actually
  // reached the desired state, mechanically checked.
  const finalChecks = L.runChecks(fixtureRepo, CHECKS);
  for (const c of finalChecks)
    V.assert(`${prefix}acceptance check '${c.name}' passes in the final tree`, c.ok, c.detail);

  // EVIDENCE (not a verdict): how close the run's trajectory was to the human's.
  let trajectory = null;
  try {
    trajectory = L.compareTrajectory(fixtureRepo, startSha, ctx.bundle);
    L.say(`${prefix}trajectory: run ${trajectory.runTurns} turns vs golden ${trajectory.goldenTurns}; mean files-overlap ${trajectory.meanOverlap.toFixed(2)}; first divergence @${trajectory.firstDivergence}`);
  } catch (e) { L.say(`${prefix}trajectory compare skipped: ${e.message}`); }

  const passed = !timedOut && loop?.status === 'done' && finalChecks.every((c) => c.ok);
  return { i, passed, loopStatus: loop?.status, stopReason: loop?.stopReason,
    iterations: loop?.iterationsDone ?? null, checks: finalChecks, trajectory };
}

try {
  await L.buildOnce();
  ctx = await L.provisionFromBundle(EXAMPLE);
  await L.boot(ctx);
  await L.login();
  if (!(await L.livePreflight(V))) throw new L.Abort('live preflight failed');

  for (let i = 0; i < RUNS; i++) {
    const prefix = RUNS > 1 ? `run ${i + 1}/${RUNS}: ` : '';
    if (RUNS > 1) L.say(`\n=== golden reliability ${prefix.trim()} ===`);
    runReports.push(await runOnce(i, prefix));
  }
} catch (e) {
  if (!(e instanceof L.Abort)) V.assert('scenario ran to completion', false, e?.stack || String(e));
} finally {
  await L.captureDiagnostics(ctx, V).catch(() => {});
  await L.down(ctx).catch(() => {});
}

// Reliability aggregate (design D5) — evidence for multi-run sweeps.
let reliability = null;
if (RUNS > 1 && runReports.length) {
  const passedRuns = runReports.filter((r) => r.passed).length;
  const iters = runReports.map((r) => r.iterations).filter((n) => typeof n === 'number');
  reliability = {
    runs: RUNS, passed: passedRuns, passRate: Number((passedRuns / RUNS).toFixed(2)),
    minIterations: iters.length ? Math.min(...iters) : null,
    maxIterations: iters.length ? Math.max(...iters) : null,
  };
  L.say(`reliability: ${passedRuns}/${RUNS} runs passed (pass-rate ${(reliability.passRate * 100).toFixed(0)}%), iterations ${reliability.minIterations}–${reliability.maxIterations}`);
}

process.exitCode = L.finish(V, jsonOut, {
  example: EXAMPLE,
  runs: runReports.map((r) => ({ passed: r.passed, loopStatus: r.loopStatus,
    iterations: r.iterations, trajectory: r.trajectory })),
  reliability,
});
