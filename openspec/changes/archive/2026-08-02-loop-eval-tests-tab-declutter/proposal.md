# Proposal: loop-eval-tests-tab-declutter

## Why

Operator feedback on the shipped Tests tab (loop-eval-scenario-transparency): the
E2E eval subtab mixes the two things it exists for. The **Full sweep** row is a
redundant UI item — "run everything" is what you do anyway when you're testing;
it doesn't deserve a third startable card next to the two real scenarios. And the
subtab surrounds the actual startable rows with paragraphs of mechanics prose
("content vomit"): run modes, cost rationale, lineage, testability notes. The
runnable surface and the explanation of how it works need to live on separate
subtabs.

## What Changes

- **Remove the Full sweep (run-all) scenario row** from the E2E eval runner: it no
  longer appears in the preflight scenarios listing and the start endpoint no
  longer accepts it. The committed `tests/loop-eval/run-all.mjs` script stays —
  it remains the terminal/agent entry point for a full sweep (isolated-mode gate
  before shipping); only the harness-runner surface drops it.
- **Split the E2E eval subtab in two**: the existing subtab keeps only the
  operational surface (precondition banner, the two scenario rows with cost copy
  + manifest disclosure + Start, and the active/last run panel). All
  explanation prose — what the layer is, the two run modes, what it costs,
  lineage, the rule of thumb — moves to a new sibling subtab dedicated to
  mechanics/explanations.
- Frontend-only composes rendering (the stacked child manifests that existed for
  run-all's row) becomes unreachable and is removed with it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `loop-eval-ui-runner`: the scenario listing requirement changes from "goal,
  queue, run-all" to the two atomic scenarios (goal, queue) with run-all
  explicitly excluded from the runner surface; a new requirement separates the
  runnable rows from the explanatory content (runner subtab shows tests only,
  mechanics prose lives on its own subtab).

## Impact

- `ClaudeWeb.App/Services/LoopEval/LoopEvalRunnerService.cs` — drop the run-all
  `ScenarioDef` (start validation and preflight listing follow from the list).
- `client/src/components/autopilot/TestInventoryView.jsx` — runner section slims
  to rows + run panel; prose sections move to a new `section` value; composes
  branch of the manifest renderer removed.
- `client/src/components/autopilot/AutopilotConsole.jsx` — one new subtab entry
  under the Tests root tab.
- `tests/loop-eval/` — unchanged (run-all.mjs, its --describe compose contract,
  and the loop-eval capability spec are untouched; the suite remains the source
  of truth).
- Pending-change interplay: `loop-eval-scenario-transparency` (unarchived)
  added the manifest-disclosure requirement this change inherits; its loop-eval
  capability delta (scripts self-describe, run-all composes) is NOT touched —
  only the UI-runner surface changes here.
