# Design: loop-eval-scenario-transparency

## Context

The E2E eval runner (openspec: loop-eval-ui-runner) lists scenarios from a
hardcoded `ScenarioDef` table in `LoopEvalRunnerService.cs` — id, script,
title, cost copy, timeout. Everything an operator would need to *understand*
the test lives only in the suite scripts:

- `goal.mjs`: `GOAL` prompt text, `MAX_ITERATIONS = 6`, deadline
  (`LOOPEVAL_GOAL_MINUTES`, default 15), arm body
  `{kind:'goal', mode:'drive'}`, fixture `goal` (todo CLI missing its `done`
  command + failing `goal-check.mjs`), and the assertion ladder
  (done·verified, iterations ≤ cap, goal-check exits 0, audit all
  loop-attributed, …).
- `queue.mjs`: six prompts from `fixtures/queue/expected.json` (each with an
  artifact path + regex), `MAX_ITERATIONS = 18`, deadline default 25 min, arm
  body `{kind:'queue', mode:'drive', verifyEnabled:true,
  denyList:['reset --hard','force-push']}`, drain-to-done contract.
- `run-all.mjs`: composition of the two.

The suite is the declared single source of truth for scenario logic
(loop-eval-ui-runner spec: "no reimplementation of scenario logic in the
harness"). Any transparency feature must extend that stance, not erode it.

## Goals / Non-Goals

**Goals:**
- The operator can read, per scenario and before starting: the loop parameters
  that will be armed, the source fixture repository (and what's in it), and
  the assertion contract that decides pass/fail.
- Zero duplication: the displayed facts are emitted by the scenario scripts
  themselves, from the same constants the run uses.
- Cheap and safe: describing scenarios spends no tokens, boots nothing,
  touches no harness state.

**Non-Goals:**
- No new fixture system or fixture relocation (the committed
  `tests/loop-eval/fixtures/<name>/repo-template/` layout stays as is).
- No editing of scenario parameters from the UI — read-only transparency.
- No change to run semantics, preflight gating, credentials, or cleanup.
- Isolated-mode runs are untouched (describe is mode-blind anyway).

## Decisions

### D1 — Self-description via `--describe` on the scenario scripts

Each of `goal.mjs`, `queue.mjs`, `run-all.mjs` handles `--describe` as the
very first action: print a JSON manifest to stdout and `process.exit(0)`
before any provisioning, build, or network call.

*Why not a committed static manifest file?* A sidecar JSON would be a second
place to maintain the goal text / caps / deny list and would drift exactly
like `ScenarioDef` already does. With `--describe`, the manifest is built from
the very constants the run path uses (`GOAL`, `MAX_ITERATIONS`, `EXPECTED`,
the literal arm bodies), so it cannot lie about what the run would do.
`run-all.mjs` composes the child manifests, mirroring how it composes runs.

*Why not have the harness parse the scripts?* Parsing JS from C# is fragile;
executing the script in its own declared describe mode keeps the contract in
the suite where the spec says scenario knowledge lives.

### D2 — Manifest shape (stable, versioned)

```json
{
  "describeVersion": 1,
  "id": "goal",
  "title": "Goal loop",
  "loop": {
    "kind": "goal", "mode": "drive", "maxIterations": 6,
    "deadlineMinutes": 15, "deadlineEnv": "LOOPEVAL_GOAL_MINUTES",
    "goal": "<the exact GOAL prompt text>",
    "denyList": null, "verifyEnabled": null,
    "prompts": null
  },
  "fixture": {
    "name": "goal",
    "templatePath": "tests/loop-eval/fixtures/goal/repo-template",
    "summary": "todo CLI with `done` deliberately missing; goal-check.mjs fails until implemented",
    "files": ["CLAUDE.md", "todo.mjs", "goal-check.mjs", ".gitignore"],
    "workingCopy": "materialized to a scratch dir, git-inited, registered as loopeval-goal-*-live, torn down after the run"
  },
  "expected": [
    "loop resolves done · verified (LOOP_DONE → verify → GOAL_VERIFIED)",
    "iterations within cap (≤ 6)",
    "goal-check.mjs exits 0 afterwards (feature really implemented)",
    "every send loop-attributed in the audit log"
  ]
}
```

`queue`'s `loop.prompts` carries the six prompts with their artifact
path+pattern (straight from `expected.json`); `denyList` and `verifyEnabled`
are filled; `goal` is null. `run-all` returns
`{ id: "run-all", composes: [<goal manifest>, <queue manifest>] }`.

The `expected` array is a human-readable statement of the assertion contract,
declared as a top-of-file constant next to the other scenario constants. It is
the one part that is *descriptive* rather than shared-by-construction with the
run path — accepted (D2 trade-off) because assertion names are inline strings
in imperative code; hoisting every one into shared constants would contort the
scripts for marginal gain. The fixture-drift preflights already catch the
dangerous kind of drift (fixture no longer proving anything).

### D3 — Harness serves manifests through the existing scenarios payload

`LoopEvalRunnerService` runs `node <script> --describe` for each scenario the
first time the preflight endpoint is hit (and whenever the script file's
mtime changes — same freshness rule an operator would expect after a pull),
parses the JSON, and attaches it as `manifest` on each entry of the existing
`scenarios` array. Failures degrade gracefully: a scenario whose describe
spawn fails still lists with title/cost (current behavior) plus a
`manifestError` string — transparency must never block running.

`ScenarioDef` keeps only what the harness itself needs to spawn and babysit
the process: id, script path, timeout, cost copy. Title moves to the manifest
(served value prefers the manifest's, falls back to `ScenarioDef`).

*Why not a new endpoint?* The UI already polls preflight for gating; the
scenario list already rides on it. One payload, no new fetch choreography.

### D4 — UI: expandable scenario rows, visible before Start

Each scenario row in `LoopEvalRunner` gains a disclosure ("what does this
test?") that expands to three labeled blocks:

1. **Arms** — kind/mode, iteration cap, deadline, deny list, verify flag, and
   the full goal prompt (goal) or the prompt→artifact table (queue).
2. **Acts on** — fixture name, committed template path (as `code`), file
   list, the one-line content summary, and the working-copy lifecycle line so
   the "where is the repository?" question answers itself in the UI.
3. **Must hold** — the `expected` list, rendered as the same checklist visual
   the post-run assertions use, greyed until the run produces real verdicts.

Collapsed by default (rows stay scannable); no Simple-mode exposure (the
runner is already Advanced-gated behind `loopEvalRunner`).

## Risks / Trade-offs

- [Describe spawns node processes from the harness] → Only on preflight of the
  Tests tab, only for the committed suite path already trusted for full runs,
  with a short timeout (5 s) and stdout capped; a hung describe yields
  `manifestError`, never blocks the list.
- [`expected` array can drift from the real assertion ladder] → It lives
  adjacent to the constants in the same file and is reviewed with any
  assertion change; a `run-all --describe` smoke assertion in the suite README
  checklist keeps it honest. Accepted as descriptive text (see D2).
- [Manifest shape churn breaks the UI] → `describeVersion` field; UI renders
  unknown/missing fields as absent rather than erroring.
- [Goal prompt text is long] → UI clamps with expand-on-click; manifest is
  served verbatim (the exact prompt is precisely what transparency means).

## Migration Plan

Pure addition: ship suite + harness + client together on the standing
`feat/loop-tests` branch. No data migration, no config. Rollback = revert.

## Open Questions

None blocking. (If a future fixture gains a setup script that fabricates git
history, its manifest `fixture.summary` should describe that too — covered by
the shape, no design change needed.)
