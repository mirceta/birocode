# Tasks — add-loop-eval-suite

## 1. Harness lib (isolated instance lifecycle)

- [ ] 1.1 Create `tests/loop-eval/lib.mjs` by adapting `tests/chat-systest/hub/instance.mjs`: build once, copy binaries outside the repo tree, spawn with `CLAUDEWEB_DATADIR`/`CLAUDEWEB_Port` (default 5210)/`CLAUDEWEB_AuthPassword`, login, health poll, `down()` with `taskkill /T /F` in `finally`
- [ ] 1.2 Add data-dir seeding to `lib.mjs`: write `autopilot-gate.json` (enabled) and `autopilot.json` (kill switch on, auto-advance on) into the fresh data dir before boot; for queue runs also write `dock.json` with the scenario's tab + stash items
- [ ] 1.3 Add fixture materialization: copy `fixtures/<scenario>/repo-template/` to a temp dir, `git init` + initial commit, register via `POST /api/repos`, return repoId
- [ ] 1.4 Add engine driving helpers: seed-turn via `POST /api/chat` (abort suite with a "CLI not working" verdict if it errors), arm via `POST /api/autopilot/loop`, poll `GET /api/autopilot/loops` + `GET /api/runs` at 5s cadence with a per-scenario deadline
- [ ] 1.5 Add verdict machinery: `assert(name, ok, detail)` collecting per-assertion results, `@@LOOPEVAL@@ {json}` event lines, summary JSON (`--json <out>`), exit code 0 only if all pass; on failure attach the isolated instance's log tail and the final `loops.json` record

## 2. Goal-loop scenario

- [ ] 2.1 Author `fixtures/goal/repo-template/`: a tiny no-build node mini-product with one deliberately missing feature, a `CLAUDE.md` stating the contract, and `goal-check.mjs` that exits non-zero until the feature exists
- [ ] 2.2 Write `tests/loop-eval/goal.mjs`: precondition (goal check FAILS on fresh fixture), seed turn, arm goal loop in drive mode (work prompt names the feature + goal check; verify enabled; maxIterations 6), poll to resolution
- [ ] 2.3 Assertions: loop record ends `done · verified` (work → LOOP_DONE → verify → GOAL_VERIFIED), `node goal-check.mjs` in the materialized repo now exits 0, `iterationsDone <= 6`, audit lines show only loop-attributed sends
- [ ] 2.4 Run the goal scenario for real (spends tokens); tune fixture/prompt until it passes twice in a row; record cost + duration in the README

## 3. Queue-loop scenario

- [ ] 3.1 Author `fixtures/queue/repo-template/` plus 6 prompts (each demanding a small mechanically checkable artifact) and `expected.json` mapping each prompt to its artifact check (path + regex)
- [ ] 3.2 Write `tests/loop-eval/queue.mjs`: precondition (all 6 artifacts ABSENT), seed turn, seed dock stash, arm queue loop in drive mode (verify enabled, maxIterations 12), poll to resolution
- [ ] 3.3 Assertions: loop record ends `done · drained`, `queueSent == 6` with `queueSentTexts` in arm order, every `expected.json` artifact exists and matches, no escalation stop
- [ ] 3.4 Run the queue scenario for real; tune prompts until it passes twice in a row; record cost + duration in the README

## 4. Suite entry + docs

- [ ] 4.1 Write `tests/loop-eval/run-all.mjs` (goal then queue, combined summary + exit code) and `tests/loop-eval/README.md`: what it proves, launch commands, cost/duration expectations, never-CI policy, troubleshooting (port, CLI probe, gate seed)
- [ ] 4.2 Update `client/src/components/autopilot/TestInventoryView.jsx`: rehearsal subtab now documents the committed loop-eval suite (scenarios, cost, CLI command) instead of untracked scratch; plan subtab notes the eval layer exists and narrows the remaining gap to the fake-runner seam
- [ ] 4.3 Verify the Tests tab copy renders in the browser (headless check per `docs/claude-web/browser-testing.md`); `openspec validate add-loop-eval-suite --strict` passes
