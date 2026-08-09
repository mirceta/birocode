# Tasks — loop-evals

## 1. Bundle format + first example

- [x] 1.1 Define `manifest.json` schema (id, description, loop seed hints, turn→SHA map, acceptance checks) and document the bundle layout in `tests/loop-evals/README.md`
- [x] 1.2 Hand-author a small synthetic golden example under `tests/loop-evals/examples/` (tiny repo, short plan, 3–5 golden turns, acceptance checks) — built as a real git history, shipped as `repo.bundle`
- [x] 1.3 Bundle loader: parse manifest + transcript, clone `repo.bundle` to scratch, verify turn SHAs exist (spec: bundle is self-contained; transcript joins to repo states)

## 2. Runner

- [x] 2.1 Scaffold `tests/loop-evals/LoopEvals/` console project referencing `ClaudeWeb.App` (DiscoveryEval precedent)
- [x] 2.2 Compose the production loop services in-process (`AutopilotModuleExtensions`) against a scratch repo; wire the queue-based loop, seeded from `plan.md` per the manifest's seed hints
- [x] 2.3 Turn cap + wall-clock timeout; commit scratch tree per completed agent turn to a `run/<n>` branch (spec: runaway cut-off; runs isolated)
- [x] 2.4 N-runs mode: repeat (example, config) N times into separate scratch clones

## 3. Scorer + report

- [x] 3.1 Acceptance-check executor: run manifest checks in the final working copy → verdict with failing check named
- [x] 3.2 Diff evidence: final tree vs `eval/final` (files added/removed/changed)
- [x] 3.3 Trajectory compare: turn counts, per-turn files-touched overlap vs golden, first-divergence turn
- [x] 3.4 Report output: JSON + console table per run, aggregate (pass rate, worst case, turn spread) for N runs

## 4. Curation (operator-facing UI over repo copy + stored conversation)

- [x] 4.1 Read-only Operator endpoints: list a repo's stored session conversations with turns; list a repo copy's commit history (subject, SHA, files touched) for association
- [x] 4.2 Curation UI in the client (Advanced mode + operator gate, added to the UiModeContext capability map): pick repo copy + conversation, mark turn span, associate turns↔commits side by side, label each in-span turn, author plan + acceptance checks
- [x] 4.3 Export endpoint: build the bundle from the associations (`eval/start` before first associated commit, `golden` chain, `eval/final` tip, labeled `conversation.jsonl`, manifest) into the configured examples root
- [x] 4.4 C# tests for the exporter (five-commit chain round-trip, carry-forward turn mapping, sources byte-identical after export)

## 5. Verify + docs

- [x] 5.1 End-to-end: run the synthetic example through the runner + scorer; confirm a deliberately-broken loop config scores worse than a good one
- [x] 5.2 External examples root honored (config outside repo); committed-example-must-be-synthetic note in README
- [x] 5.3 `openspec validate loop-evals --strict` passes; update Understanding app for the eval flow

## 6. Rework: golden replay as a `loop-eval` scenario (supersedes the in-process runner)

Rationale: fit the golden-example eval into the shipped `loop-eval` suite so it runs as an
automatic isolated test, live, and watchable from the Tests-tab runner — instead of an
offline console tool. The format + curation layer (§1, §3.1, §4) is kept as-is; the
execution + scoring layer (§2, §3.2–3.4) is replaced.

- [x] 6.1 Shared helpers in `tests/loop-eval/lib.mjs`: `provisionFromBundle`, `materializeGolden` (clone bundle at `eval/start`, strip golden refs), `runChecks` (acceptance verdict), `compareTrajectory` (run commits vs golden fetched from the bundle)
- [x] 6.2 `tests/loop-eval/golden.mjs` scenario: `--describe`, drift guard, register → dock stash from `plan.md` → chat seed → arm queue loop → watch → acceptance verdict, trajectory as evidence, dock binding + watch banner
- [x] 6.3 Register in the runner catalog (`LoopEvalRunnerService.Scenarios`) and both `run-all.mjs` arrays; client Tests-tab list is dynamic (no change)
- [x] 6.4 Reliability: `--runs N` isolated-only sweep with pass-rate + iteration spread; live mode refuses N>1 (single watchable run)
- [x] 6.5 Remove the standalone console project `tests/loop-evals/LoopEvals/` and its `ClaudeWeb.sln` entries; keep the `BundleExporter` tests (app-side)
- [ ] 6.6 Verify: solution builds; `golden.mjs --describe` + `run-all.mjs --describe` compose; git plumbing (materialize/strip/trajectory) validated offline against the committed bundle; a real isolated run passes (spends tokens — run on demand)
- [ ] 6.7 Update `tests/loop-evals/README.md` run section and the Understanding app for the scenario-based flow; `openspec validate loop-evals --strict` passes
