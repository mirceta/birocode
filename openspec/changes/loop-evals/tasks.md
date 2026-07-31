# Tasks — loop-evals

## 1. Bundle format + first example

- [ ] 1.1 Define `manifest.json` schema (id, description, loop seed hints, turn→SHA map, acceptance checks) and document the bundle layout in `tests/loop-evals/README.md`
- [ ] 1.2 Hand-author a small synthetic golden example under `tests/loop-evals/examples/` (tiny repo, short plan, 3–5 golden turns, acceptance checks) — built as a real git history, shipped as `repo.bundle`
- [ ] 1.3 Bundle loader: parse manifest + transcript, clone `repo.bundle` to scratch, verify turn SHAs exist (spec: bundle is self-contained; transcript joins to repo states)

## 2. Runner

- [ ] 2.1 Scaffold `tests/loop-evals/LoopEvals/` console project referencing `ClaudeWeb.App` (DiscoveryEval precedent)
- [ ] 2.2 Compose the production loop services in-process (`AutopilotModuleExtensions`) against a scratch repo; pick and wire the first loop kind, seeded from `plan.md`
- [ ] 2.3 Turn cap + wall-clock timeout; commit scratch tree per completed agent turn to a `run/<n>` branch (spec: runaway cut-off; runs isolated)
- [ ] 2.4 N-runs mode: repeat (example, config) N times into separate scratch clones

## 3. Scorer + report

- [ ] 3.1 Acceptance-check executor: run manifest checks in the final working copy → verdict with failing check named
- [ ] 3.2 Diff evidence: final tree vs `eval/final` (files added/removed/changed)
- [ ] 3.3 Trajectory compare: turn counts, per-turn files-touched overlap vs golden, first-divergence turn
- [ ] 3.4 Report output: JSON + console table per run, aggregate (pass rate, worst case, turn spread) for N runs

## 4. Capture (harness runtime, operator-facing)

- [ ] 4.1 Turn-completion hook: when capture armed for a repo, commit working tree to shadow branch `eval-capture/<session-id>` with turn index — no touch of user branch/index; inert when unarmed
- [ ] 4.2 Operator endpoints: arm / status / finish / abandon capture for a repo
- [ ] 4.3 Finish-export: assemble bundle (shadow branch → `golden`, arm point → `eval/start`, tip → `eval/final`, transcript export joined by turn index) into the configured examples root
- [ ] 4.4 C# tests for the capture writer (shadow-branch isolation, unarmed inertness, export round-trip)

## 5. Verify + docs

- [ ] 5.1 End-to-end: run the synthetic example through the runner + scorer; confirm a deliberately-broken loop config scores worse than a good one
- [ ] 5.2 External examples root honored (config outside repo); committed-example-must-be-synthetic note in README
- [ ] 5.3 `openspec validate loop-evals --strict` passes; update Understanding app for the eval flow
