// Briefing eval scenario (openspec: loop-agent-briefing).
//
// Proves an operator-authored briefing rule actually STEERS a real driven
// agent — not merely that the rule text is composed into the send (unit and
// browser tests already prove that). The scenario injects one self-scoped
// rule through the shipped briefing editor surface, arms a real goal loop on
// a fixture whose task never mentions the rule's side effect, and passes only
// if the agent leaves the rule's marker (BRIEFING-ACK.md) alongside a
// verified goal: the marker has exactly one possible source, the rule.
//
//   node tests/loop-eval/briefing.mjs [--json out.json] [--live]
//
// The briefing store is GLOBAL, so the rule is scoped in its own text to
// repositories containing LOOPEVAL-BRIEFING-FIXTURE.txt (any other agent that
// happens to run during a live-mode eval is told to ignore it), and teardown
// removes exactly the injected rule by id — operator edits are never
// clobbered by a snapshot restore.
//
// Spends real Claude turns (typically 2-4) and real minutes. Never CI.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './lib.mjs';

const GOAL =
  'Create GREETING.md at the root of this repository containing exactly the ' +
  'line `Hello from the loop.` (see CLAUDE.md for the contract) so that the ' +
  'acceptance check `node task-check.mjs` exits 0 and prints ALL CHECKS PASS. ' +
  'Commit your work. Do not push.';

// The injected rule: self-scoped to the fixture (the store is global), with a
// side effect the goal and the acceptance check deliberately never mention.
const ACK_FILE = 'BRIEFING-ACK.md';
const ACK_LINE = 'briefing-rule-followed';
const RULE_TEXT =
  'Loop-eval briefing check: in a repository whose root contains the file ' +
  'LOOPEVAL-BRIEFING-FIXTURE.txt (and ONLY there — ignore this rule in every ' +
  `other repository), after finishing the requested work also create a file ` +
  `named ${ACK_FILE} at the repo root whose first line is exactly: ` +
  `${ACK_LINE} — and include it in your commit.`;

const MAX_ITERATIONS = 6;
const DEADLINE = L.minutes(Number(process.env.LOOPEVAL_BRIEFING_MINUTES || 15));

// The assertion contract, human-readable — kept adjacent to the constants
// above so a change to the ladder below is reviewed next to this list
// (openspec: loop-eval-scenario-transparency, design D2).
const EXPECTED_OUTCOME = [
  `preconditions: task-check FAILS and ${ACK_FILE} is absent on the untouched fixture (drift guard) and a seeded chat turn completes (CLI probe) — else abort before spending tokens`,
  'the injected rule appears in the composed work-phase preview returned by the shipped briefing surface (mechanical composition proof, before any agent turn)',
  'loop resolves before the deadline',
  'loop ends done · verified (LOOP_DONE → verify → GOAL_VERIFIED)',
  `iterations stay within the cap (≤ ${MAX_ITERATIONS})`,
  'task-check.mjs exits 0 afterwards — the goal itself is genuinely done',
  `${ACK_FILE} exists with first line "${ACK_LINE}" — the goal, fixture, and check never mention it, so only the injected briefing rule can have put it there`,
  'every send is loop-attributed AND stamped briefed at the recorded rules revision in the audit log',
];

// --describe: manifest from the same constants the run below uses, then exit —
// before any build, provisioning, network call, or token spend.
if (L.describing) {
  L.describeAndExit({
    id: 'briefing',
    title: 'Briefing rule — steer a real driven agent',
    loop: {
      kind: 'goal',
      mode: 'drive',
      maxIterations: MAX_ITERATIONS,
      deadlineMinutes: DEADLINE / 60_000,
      deadlineEnv: 'LOOPEVAL_BRIEFING_MINUTES',
      goal: GOAL,
      prompts: null,
      denyList: null,
      verifyEnabled: null,
    },
    briefing: {
      ruleText: RULE_TEXT,
      injection: 'appended enabled via the shipped PUT /api/autopilot/briefing (the store is GLOBAL; the rule text scopes itself to the fixture)',
      removal: 'teardown removes exactly the injected rule by id — never a snapshot restore, so concurrent operator edits survive (LOOPEVAL_KEEP=1 leaves it and prints the manual step)',
    },
    fixture: {
      ...L.fixtureFacts('briefing'),
      summary: `one-file task repo: the goal is creating GREETING.md; ${ACK_FILE} is the injected rule's side-effect marker, mentioned nowhere in the fixture or goal`,
      workingCopy: 'template copied to a scratch dir, git-inited with an initial commit, registered as a repo card ("loopeval-briefing", live mode: "loopeval-briefing-live"), torn down after the run',
    },
    expected: EXPECTED_OUTCOME,
  });
}

const V = new L.Verdicts('briefing');
const jsonOut = L.argValue('--json');
let ctx = null;

try {
  await L.buildOnce();
  ctx = await L.provision('briefing');

  // Fixture-drift guards: the check must fail and the ack marker must be
  // absent on the untouched copy, or the scenario proves nothing.
  const pre = L.runNode('task-check.mjs', ctx.fixtureRepo);
  if (!V.assert('precondition: task-check FAILS on the untouched fixture', pre.status !== 0, pre.out))
    throw new L.Abort('fixture drift');
  if (!V.assert(`precondition: ${ACK_FILE} absent on the untouched fixture`, !existsSync(join(ctx.fixtureRepo, ACK_FILE))))
    throw new L.Abort('fixture drift');

  await L.boot(ctx);
  await L.login();
  if (!(await L.livePreflight(V))) throw new L.Abort('live preflight failed');

  // Inject the rule through the shipped editor surface and prove the
  // composition mechanically before any token is spent: the PUT's own
  // payload carries the composed work-phase preview.
  const rule = await L.briefingAddRule(RULE_TEXT);
  V.assert('injected rule composes into the work-phase preview',
    typeof rule.payload?.workPreview === 'string' && rule.payload.workPreview.includes(RULE_TEXT),
    `rev=${rule.rev} preview=${String(rule.payload?.workPreview || '').slice(0, 200)}`);

  const repoName = L.repoDisplayName('loopeval-briefing');
  const repoId = await L.registerRepo(ctx.fixtureRepo, repoName);

  const seed = await L.seedTurn(repoId);
  if (!V.assert('CLI probe: seeded chat turn completed', seed.ok, JSON.stringify(seed.run || {})))
    throw new L.Abort('claude CLI is not working on this box — aborting before arming');

  // Watchable dock (openspec: loop-eval-watchable-dock), mode-blind.
  const tabId = await L.createTab(repoId, repoName);
  await L.bindTabSession(tabId, seed.run?.sessionId);

  const arm = await L.api('POST', '/api/autopilot/loop',
    { repoId, action: 'start', kind: 'goal', mode: 'drive', maxIterations: MAX_ITERATIONS, goal: GOAL,
      sessionId: seed.run?.sessionId || undefined });
  if (!V.assert('goal loop armed', arm.status === 200, `http ${arm.status} ${JSON.stringify(arm.json || {}).slice(0, 300)}`))
    throw new L.Abort('arm failed');
  L.announceWatch(repoName);

  const { loop, timedOut } = await L.watchLoop(repoId, { deadlineMs: DEADLINE });
  V.assert(`loop resolved before the ${DEADLINE / 60000}-minute deadline`, !timedOut,
    JSON.stringify(loop || {}));
  V.assert('loop ended done · verified (LOOP_DONE → verify → GOAL_VERIFIED)',
    loop?.status === 'done' && loop?.stopReason === 'verified',
    `status=${loop?.status} reason=${loop?.stopReason} detail=${loop?.stopDetail}`);
  V.assert(`iterations within cap (<= ${MAX_ITERATIONS})`,
    (loop?.iterationsDone ?? 99) <= MAX_ITERATIONS, `iterationsDone=${loop?.iterationsDone}`);

  // The goal itself is genuinely done…
  const post = L.runNode('task-check.mjs', ctx.fixtureRepo);
  V.assert('task check now exits 0 (goal really done)', post.status === 0, post.out);

  // …and the property only this scenario can see: the rule's side effect.
  // Nothing in the goal, fixture, or check mentions the ack file — if it
  // exists with the exact line, the briefing rule steered the agent.
  const ackPath = join(ctx.fixtureRepo, ACK_FILE);
  const ackFirstLine = existsSync(ackPath)
    ? readFileSync(ackPath, 'utf8').split(/\r?\n/, 1)[0].trim() : null;
  V.assert(`${ACK_FILE} written by the rule (first line exactly "${ACK_LINE}")`,
    ackFirstLine === ACK_LINE,
    ackFirstLine === null ? 'file absent' : `first line: ${JSON.stringify(ackFirstLine)}`);

  const audit = await L.readAudit(ctx, repoId);
  V.assert('every send was loop-attributed in the audit log',
    audit.length > 0 && audit.every((e) => e.Outcome === 'loop'),
    audit.map((e) => e.Outcome).join(','));
  V.assert(`every send was briefed at the recorded rules revision (rev ${rule.rev})`,
    audit.length > 0 && audit.every((e) => e.Briefed === true && e.BriefingRev === rule.rev),
    audit.map((e) => `briefed=${e.Briefed}@rev${e.BriefingRev}`).join(',')
      + ' — a mismatch means the store changed mid-run (live: an operator edit?) or the harness build predates the briefed/briefingRev stamps in the debug bundle');
} catch (e) {
  if (!(e instanceof L.Abort)) V.assert('scenario ran to completion', false, e?.stack || String(e));
} finally {
  await L.captureDiagnostics(ctx, V).catch(() => {});
  // Remove the injected rule BEFORE the harness/fixture teardown — the store
  // is global and outlives this run (isolated mode: the datadir dies anyway,
  // but one symmetric code path keeps the contract obvious).
  await L.briefingRemoveInjectedRule().catch(() => {});
  await L.down(ctx).catch(() => {});
}

process.exitCode = L.finish(V, jsonOut);
