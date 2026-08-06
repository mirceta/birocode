# Proposal: loop-eval-scenario-transparency

## Why

The Tests tab can start an E2E loop-eval scenario, but it cannot say what that
scenario actually *does*: the loop parameters it arms (goal prompt, queue
prompts, kind/mode, iteration cap, deadline, deny list), the source fixture
repository it materializes and acts on, and the assertion contract that decides
pass/fail all live only inside `tests/loop-eval/goal.mjs` / `queue.mjs`. The
operator sees a title, a cost estimate, and a script path — the test is a black
box unless they read the source. The harness-side `ScenarioDef` list is already
a small hand-maintained duplicate (title/turns/minutes) that would drift further
if we extended it by hand.

## What Changes

- Each scenario script (`goal.mjs`, `queue.mjs`, `run-all.mjs`) gains a
  `--describe` mode that prints a machine-readable JSON manifest and exits
  without spending tokens or touching any harness: the loop parameters it will
  arm (built from the same constants the run uses), the source fixture (name,
  committed template path, content summary), and the expected outcome (the
  assertion contract).
- The harness's loop-eval runner service invokes `--describe` (cached, cheap)
  and serves the manifest through the existing preflight/scenarios payload —
  the hand-maintained parts of `ScenarioDef` shrink instead of grow; the suite
  stays the single source of truth for scenario knowledge.
- The Tests tab scenario rows become expandable: each shows "what it arms"
  (parameters), "what it acts on" (fixture repo + template path), and "what
  must hold" (expected outcome list) before the operator ever clicks Start.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `loop-eval`: the suite's scenario scripts SHALL be self-describing — a
  `--describe` flag emits the scenario's manifest (parameters, fixture,
  expected outcome) as JSON derived from the same values the live run uses,
  with no side effects and no token spend.
- `loop-eval-ui-runner`: the Tests tab's scenario listing SHALL surface each
  scenario's manifest (loop parameters, source fixture repository, expected
  outcome) sourced from the suite's `--describe` output, never from
  harness-maintained copies of scenario knowledge.

## Impact

- `tests/loop-eval/goal.mjs`, `queue.mjs`, `run-all.mjs`, `lib.mjs` — describe
  mode; scenario constants (goal text, iteration caps, deadlines, deny list,
  expected artifacts) referenced by both the run path and the manifest.
- `ClaudeWeb.App/Services/LoopEval/LoopEvalRunnerService.cs` — spawn/cache
  `--describe`, extend the scenarios payload; `ScenarioDef` loses any field the
  manifest now carries.
- `ClaudeWeb.App/Controllers/LoopEvalController.cs` — unchanged routes, richer
  payload.
- `client/src/components/autopilot/TestInventoryView.jsx` + `autopilot.css` —
  expandable scenario rows.
- No API surface removed; no breaking changes. Cost: one short `node` spawn
  per scenario at preflight time (cacheable per file mtime).
