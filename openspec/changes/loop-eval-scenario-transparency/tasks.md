# Tasks: loop-eval-scenario-transparency

## 1. Suite — `--describe` manifests (single source of truth)

- [x] 1.1 `lib.mjs`: add a small `describeAndExit(manifest)` helper — stringify,
      print, `process.exit(0)` — plus a shared `DESCRIBE_VERSION = 1` constant
      and a `fixtureFacts(name)` helper that lists the committed
      `fixtures/<name>/repo-template/` files and returns the template path.
- [x] 1.2 `goal.mjs`: hoist the expected-outcome list to a top-of-file
      `EXPECTED_OUTCOME` constant next to `GOAL`/`MAX_ITERATIONS`; handle
      `--describe` FIRST (before `buildOnce`/provision), emitting the manifest
      per design D2 from the same constants the run uses (kind/mode from the
      literal arm body, cap, deadline + `LOOPEVAL_GOAL_MINUTES`, full goal
      prompt, fixture facts, lifecycle line).
- [x] 1.3 `queue.mjs`: same, with `loop.prompts` carrying the six
      prompt/path/pattern entries straight from `fixtures/queue/expected.json`,
      plus `denyList`, `verifyEnabled`, cap 18, deadline +
      `LOOPEVAL_QUEUE_MINUTES`.
- [x] 1.4 `run-all.mjs`: `--describe` composes the two child manifests
      (`{ id: 'run-all', describeVersion, composes: [goal, queue] }`) by
      spawning each child with `--describe` — no restating.
- [x] 1.5 Verify by hand: all three `--describe` invocations exit 0 in <2 s,
      valid JSON, no scratch dir created, no network; add the check to
      `tests/loop-eval/README.md`'s checklist.

## 2. Harness — serve manifests on the existing scenarios payload

- [x] 2.1 `LoopEvalRunnerService.cs`: add a manifest cache keyed by script
      mtime; on preflight, spawn `node <script> --describe` (5 s timeout,
      capped stdout, working dir = repo root) and parse; failures store a
      `manifestError` string instead.
- [x] 2.2 Extend the `scenarios` payload entries with `manifest` /
      `manifestError`; prefer the manifest's title, fall back to
      `ScenarioDef.Title`; keep `ScenarioDef` limited to spawn/supervise needs
      (id, script, timeout, cost copy) per design D3.
- [x] 2.3 Unit-test the manifest cache seam (parse ok / bad JSON / timeout →
      graceful `manifestError`, mtime invalidation) with the store-style
      test-directory override pattern used elsewhere in the tests project.

## 3. Client — expandable scenario rows

- [x] 3.1 `TestInventoryView.jsx`: add a collapsed-by-default "What does this
      test?" disclosure per scenario row with the three blocks — **Arms**
      (kind/mode, cap, deadline, deny list, verify flag, goal prompt clamped
      with expand, or queue prompt→artifact table), **Acts on** (fixture name,
      template path as code, file list, summary, working-copy lifecycle),
      **Must hold** (expected list in the assertion-checklist visual, greyed).
- [x] 3.2 Render `manifestError` as an inline note when present; unknown or
      missing manifest fields render as absent, never as errors
      (`describeVersion` tolerated forward).
- [x] 3.3 `autopilot.css`: styles for the disclosure + blocks reusing the
      existing `le-*` / `ca-sec` palette; no UiModeContext change needed (the
      runner is already Advanced-gated).
- [x] 3.4 For `run-all`, render the composed child manifests as two stacked
      sub-sections under one disclosure.

## 4. Verify & close out

- [x] 4.1 `npm --prefix client run build` and `dotnet build` green;
      `dotnet test` green (new cache tests included).
- [x] 4.2 Browser-verify per `docs/claude-web/browser-testing.md` on an
      isolated preview: Tests tab → E2E section shows the disclosures with
      real manifest content; break one script's JSON on purpose to see the
      graceful `manifestError`, then restore.
- [x] 4.3 `openspec validate loop-eval-scenario-transparency --strict` passes;
      update the E2E subtab's static copy if it now duplicates what the
      disclosures show.
