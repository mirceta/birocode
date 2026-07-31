// Goal-loop eval scenario (openspec: add-loop-eval-suite, spec loop-eval).
//
// Proves the REAL goal loop drives a REAL agent to a verified goal: the
// fixture is a todo CLI whose `done` command is missing and whose
// goal-check.mjs fails; the loop must implement it, self-declare LOOP_DONE,
// survive the verification turn (GOAL_VERIFIED), and leave the check passing.
//
//   node tests/loop-eval/goal.mjs [--json out.json]
//
// Spends real Claude turns (typically 2-4) and real minutes. Never CI.

import * as L from './lib.mjs';

const GOAL =
  'Implement the missing `done` command of todo.mjs in this repository ' +
  '(see CLAUDE.md for the contract) so that the acceptance check ' +
  '`node goal-check.mjs` exits 0 and prints ALL CHECKS PASS. ' +
  'Commit your work. Do not push.';

const MAX_ITERATIONS = 6;
const DEADLINE = L.minutes(Number(process.env.LOOPEVAL_GOAL_MINUTES || 15));

const V = new L.Verdicts('goal');
const jsonOut = L.argValue('--json');
let ctx = null;

try {
  await L.buildOnce();
  ctx = await L.provision('goal');

  // Fixture-drift guard: a template where the check already passes would make
  // the whole scenario meaningless — fail fast before any tokens are spent.
  const pre = L.runNode('goal-check.mjs', ctx.fixtureRepo);
  if (!V.assert('precondition: goal-check FAILS on the untouched fixture', pre.status !== 0, pre.out))
    throw new L.Abort('fixture drift');

  await L.boot(ctx);
  await L.login();
  const repoId = await L.registerRepo(ctx.fixtureRepo, 'loopeval-goal');

  const seed = await L.seedTurn(repoId);
  if (!V.assert('CLI probe: seeded chat turn completed', seed.ok, JSON.stringify(seed.run || {})))
    throw new L.Abort('claude CLI is not working on this box — aborting before arming');

  const arm = await L.api('POST', '/api/autopilot/loop',
    { repoId, action: 'start', kind: 'goal', mode: 'drive', maxIterations: MAX_ITERATIONS, goal: GOAL });
  if (!V.assert('goal loop armed', arm.status === 200, `http ${arm.status} ${JSON.stringify(arm.json || {}).slice(0, 300)}`))
    throw new L.Abort('arm failed');

  const { loop, timedOut } = await L.watchLoop(repoId, { deadlineMs: DEADLINE });
  V.assert(`loop resolved before the ${DEADLINE / 60000}-minute deadline`, !timedOut,
    JSON.stringify(loop || {}));
  V.assert('loop ended done · verified (LOOP_DONE → verify → GOAL_VERIFIED)',
    loop?.status === 'done' && loop?.stopReason === 'verified',
    `status=${loop?.status} reason=${loop?.stopReason} detail=${loop?.stopDetail}`);
  V.assert(`iterations within cap (<= ${MAX_ITERATIONS})`,
    (loop?.iterationsDone ?? 99) <= MAX_ITERATIONS, `iterationsDone=${loop?.iterationsDone}`);

  // The property no cheap test can see: the feature genuinely works now.
  const post = L.runNode('goal-check.mjs', ctx.fixtureRepo);
  V.assert('goal check now exits 0 (feature really implemented)', post.status === 0, post.out);

  const audit = L.readAudit(ctx);
  V.assert('every send was loop-attributed in the audit log',
    audit.length > 0 && audit.every((e) => e.Outcome === 'loop'),
    audit.map((e) => e.Outcome).join(','));
} catch (e) {
  if (!(e instanceof L.Abort)) V.assert('scenario ran to completion', false, e?.stack || String(e));
} finally {
  L.captureDiagnostics(ctx, V);
  await L.down(ctx).catch(() => {});
}

process.exit(L.finish(V, jsonOut));
