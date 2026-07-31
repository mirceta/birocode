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

- [ ] 4.1 Read-only Operator endpoints: list a repo's stored session conversations with turns; list a repo copy's commit history (subject, SHA, files touched) for association
- [ ] 4.2 Curation UI in the client (Advanced mode + operator gate, added to the UiModeContext capability map): pick repo copy + conversation, mark turn span, associate turns↔commits side by side, label each in-span turn, author plan + acceptance checks
- [ ] 4.3 Export endpoint: build the bundle from the associations (`eval/start` before first associated commit, `golden` chain, `eval/final` tip, labeled `conversation.jsonl`, manifest) into the configured examples root
- [ ] 4.4 C# tests for the exporter (five-commit chain round-trip, carry-forward turn mapping, sources byte-identical after export)

## 5. Verify + docs

- [ ] 5.1 End-to-end: run the synthetic example through the runner + scorer; confirm a deliberately-broken loop config scores worse than a good one
- [ ] 5.2 External examples root honored (config outside repo); committed-example-must-be-synthetic note in README
- [ ] 5.3 `openspec validate loop-evals --strict` passes; update Understanding app for the eval flow
