// Queue-loop eval scenario (openspec: add-loop-eval-suite, spec loop-eval).
//
// Proves the REAL queue loop drains a REAL six-prompt stash correctly: each
// prompt asks the agent for a small, mechanically checkable artifact
// (fixtures/queue/expected.json is the ground truth). The loop must advance
// through all six in order (step → STEP_VERIFIED verify → next), resolve
// done · drained with queueSent == 6, and every artifact must exist and match.
//
//   node tests/loop-eval/queue.mjs [--json out.json]
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
  const repoId = await L.registerRepo(ctx.fixtureRepo, 'loopeval-queue');
  const tabId = await L.createTabWithStash(repoId, 'loopeval-queue', EXPECTED.map((e) => e.prompt));

  const seed = await L.seedTurn(repoId);
  if (!V.assert('CLI probe: seeded chat turn completed', seed.ok, JSON.stringify(seed.run || {})))
    throw new L.Abort('claude CLI is not working on this box — aborting before arming');

  const arm = await L.api('POST', '/api/autopilot/loop', {
    repoId, action: 'start', kind: 'queue', tabId, mode: 'drive',
    verifyEnabled: true, maxIterations: MAX_ITERATIONS,
    denyList: ['reset --hard', 'force-push'],
  });
  if (!V.assert('queue loop armed', arm.status === 200, `http ${arm.status} ${JSON.stringify(arm.json || {}).slice(0, 300)}`))
    throw new L.Abort('arm failed');

  const { loop, timedOut } = await L.watchLoop(repoId, { deadlineMs: DEADLINE });
  V.assert(`loop resolved before the ${DEADLINE / 60000}-minute deadline`, !timedOut,
    JSON.stringify(loop || {}));
  V.assert('loop ended done · drained (no escalation, no error)',
    loop?.status === 'done' && loop?.stopReason === 'drained',
    `status=${loop?.status} reason=${loop?.stopReason} detail=${loop?.stopDetail}`);
  V.assert('all six prompts were sent (queueSent == 6)',
    loop?.queueSent === 6, `queueSent=${loop?.queueSent} remaining=${loop?.queueRemaining}`);

  // Sent order: QueueSentTexts is the only place the full prompt texts land in
  // loops.json. Parse it rather than substring-match the raw file — the store is
  // written by System.Text.Json, which escapes backticks/quotes (`, ").
  let sentTexts = [];
  try {
    const loops = JSON.parse(L.readLoopsJson(ctx)).Loops || {};
    sentTexts = Object.values(loops).find((l) => l.Kind === 'queue')?.QueueSentTexts || [];
  } catch { /* leave empty — the assert below fails visibly */ }
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
  L.captureDiagnostics(ctx, V);
  await L.down(ctx).catch(() => {});
}

process.exit(L.finish(V, jsonOut));
