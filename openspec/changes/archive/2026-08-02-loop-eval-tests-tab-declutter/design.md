# Design: loop-eval-tests-tab-declutter

## Context

The Tests root tab (Autopilot console) has four subtabs: Unit tests, Browser
(System tests), E2E eval, Plan: engine seam. The E2E eval subtab
(`TestInventoryView.jsx`, `section === 'rehearsal'`) renders the LoopEvalRunner
(preflight banner, scenario rows served by `GET /loopeval/preflight`, run panel)
*surrounded by* four prose sections (layer intro, "The two scenarios", "Two run
modes", "What it costs"). The scenario list is owned server-side:
`LoopEvalRunnerService.Scenarios` (goal, queue, run-all) drives both the
preflight listing and start-request validation. Operator feedback: the run-all
"Full sweep" row is redundant in the UI, and the prose drowns the rows.

Pending-change interplay: `loop-eval-scenario-transparency` (implemented,
deployed, not yet archived) added the per-row manifest disclosure and the
`--describe`/composes contract in the suite. This change rides on top of it:
the disclosure stays, the suite contract (including `run-all.mjs --describe`
composing children) is untouched.

## Goals / Non-Goals

**Goals:**
- The E2E eval subtab shows only what you can act on: precondition banner,
  the two scenario rows (goal, queue), the active/last run panel.
- All mechanics prose moves to a sibling subtab so it stays discoverable
  without burying the rows.
- run-all is no longer a startable/listed scenario in the harness runner.

**Non-Goals:**
- No change to `tests/loop-eval/` — `run-all.mjs` remains the committed
  terminal/agent entry point for a full sweep and keeps its `--describe`
  compose contract (loop-eval capability spec untouched).
- No change to the other Tests subtabs (Unit, Browser, Plan) beyond the new
  sibling entry.
- No reordering/rewriting of the moved prose beyond what the move requires.

## Decisions

**D1 — Remove run-all at the `ScenarioDef` list, nowhere else.** The single
server-side list already feeds both the preflight listing and start
validation (`Scenarios` lookup), so deleting the one entry removes the row
and makes `POST /loopeval/runs {scenario: "run-all"}` fail validation with
the existing unknown-scenario error. Alternative — filtering in the frontend —
rejected: it would leave a startable API surface the UI hides, and the list's
`suitePresent` probe (`run-all.mjs` file existence) is independent of the
`ScenarioDef` entry and stays as-is.

**D2 — Frontend composes rendering goes with it.** `ScenarioManifest`'s
`composes` branch existed solely for run-all's stacked row; with no composed
manifest ever served to the UI it is dead code and is removed.
`ScenarioManifestCache` keeps its generic compose-tolerant parsing (it caches
whatever `--describe` emits; the suite contract is unchanged) — only the
`Scenarios` set it is asked to describe shrinks.

**D3 — Split = new `section` value + one subtab entry, not a new component
tree.** `TestInventoryView` already switches on `section`; the runner subtab
(`rehearsal`) keeps LoopEvalRunner alone (plus a one-line pointer to the new
subtab), and a new `evalhow` section receives the moved prose sections
verbatim (layer intro, two scenarios, run modes, cost, rule of thumb) plus
the runner's former intro paragraph (what Start actually spawns, the token
mint). Subtab order: Unit tests · Browser · E2E eval · How E2E works · Plan.
Alternative — collapsible sections inside the same subtab — rejected: the
user explicitly asked for a separate subtab, and collapsed-by-default prose
next to Start buttons is still visual noise.

**D4 — UI-mode gating is inherited, not new.** The new subtab is part of the
existing Tests surface (already Advanced-gated at the root tab level in the
capability map); no new capability entry is needed, matching how the other
static subtabs (unit/plan) work.

## Risks / Trade-offs

- [Operator loses one-click full sweep in the UI] → Accepted by design: the
  two rows can be run back-to-back (one-run-at-a-time already enforces the
  sequence), and the committed `run-all.mjs` still gives agents/terminal the
  combined verdict where it matters (before-shipping gate).
- [Docs/specs referencing three UI scenarios drift] → The delta spec updates
  the baseline requirement; `tests/loop-eval/README.md` documents the suite
  (unchanged), not the UI rows — verify its runner mention, adjust only if it
  names the UI's three rows.
- [Moved prose goes stale invisibly] → It cites openspec change ids and file
  paths as before; the move is verbatim, so no new drift surface is created.
