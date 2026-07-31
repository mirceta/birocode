# Tasks — add-loop-eval-live-mode

## 1. lib.mjs — mode strategy

- [x] 1.1 Mode switch: `CFG.live` from `--live` argv flag or `LOOPEVAL_LIVE=1`;
      `CFG.livePort` (`LOOPEVAL_LIVE_PORT`, default 5099); `CFG.livePw` from
      `LOOPEVAL_LIVE_PW` (no default); `base()` targets the live port in live mode.
      Isolated defaults untouched.
- [x] 1.2 Live no-ops + guards: `buildOnce()`/`boot()` return immediately in live
      mode; abort before any network call if `LOOPEVAL_LIVE_PW` is missing.
- [x] 1.3 Live `provision(fixtureName)`: health-check the live harness (clear error
      if unreachable), materialize the fixture template into
      `%TMP%/cw-loopeval-live/fixture-repo` (same copy → git init → commit recipe),
      no gate/config seeding, no bin copy.
- [x] 1.4 Live preflight (post-login helper): `gateOpen` via `GET
      /api/autopilot/loops`; repo-name collision check via `GET /api/repos`
      (refuse if a `loopeval-*-live` repo already exists, print removal steps);
      kill-switch check via the debug bundle once the repo is registered. Each
      failure is a named verdict with exact operator instructions (host GUI gate
      toggle / Autopilot console kill switch).
- [x] 1.5 API-based diagnostics: `readAudit`/sent-texts/diagnostics read
      `GET /api/autopilot/loops/{repoId}/debug` in live mode (audit slice filtered
      server-side per repo; `loop.queueSentTexts` for queue order); isolated mode
      keeps its file reads byte-identical.
- [x] 1.6 Live `down(ctx)`: stop loop if active → `DELETE /api/dock/{tabId}` →
      `DELETE /api/repos/{repoId}` → remove scratch dir; `LOOPEVAL_KEEP=1` skips
      all of it and prints the manual steps; failures warn with the leftover named.
- [x] 1.7 Watch banner: after a successful arm in live mode, print where to watch
      (live URL, fixture repo name, dock/Autopilot console pointers).

## 2. Scenarios

- [x] 2.1 `goal.mjs`: run green in live mode with zero assertion changes — fixture
      registered as `loopeval-goal-live` in live mode, audit assert fed from the
      debug bundle via the lib.
- [x] 2.2 `queue.mjs`: run green in live mode with zero assertion changes — tab +
      stash on the live dock, sent-texts assert fed from `queueSentTexts` via the
      lib, repo named `loopeval-queue-live`.
- [x] 2.3 `run-all.mjs`: pass `--live` through to both scenarios.

## 3. Docs + UI copy

- [x] 3.1 `tests/loop-eval/README.md`: "Two run modes" section — when to use which
      (agent gate vs. human observation), live prerequisites (gate, kill switch,
      `LOOPEVAL_LIVE_PW`), knobs table additions, mutual-exclusion note, cleanup/
      keep behavior.
- [x] 3.2 Tests tab "E2E eval" subtab copy (client): describe both run modes +
      live prerequisites, cite the README; still pure reference content, no
      backend call.
- [x] 3.3 Understanding app: refresh `understanding-app/` to visualize the
      two-mode architecture (isolated :5210 pipeline vs. live :5099 observed run,
      shared scenario/assertion core).

## 4. Verification

- [x] 4.1 Isolated regression: `node tests/loop-eval/goal.mjs` and `queue.mjs`
      (no flag) still PASS — proves mode plumbing changed nothing by default.
- [x] 4.2 Live smoke — agent-verifiable half: run `goal.mjs --live` and
      `queue.mjs --live` against a STAND-IN live harness (isolated instance on
      :5211 with a known password, targeted via `LOOPEVAL_LIVE_PORT`/`_PW`);
      confirm PASS verdicts, watch-banner output, and post-run cleanup (no
      `loopeval-*-live` repo left registered). The true :5099 run is the
      Operator's acceptance step — the suite never learns the live password by
      design (D3), so only the human can (and should) run it: that IS the
      watch-it-live feature.
- [x] 4.3 Preflight negatives: missing `LOOPEVAL_LIVE_PW`, wrong password, and
      kill switch off each fail fast with the instructive verdict (no loop armed,
      no tokens spent beyond login attempts).
- [x] 4.4 Client build (`npm --prefix client run build`) green; Tests tab copy
      verified in a browser per `docs/claude-web/browser-testing.md`.
- [x] 4.5 `openspec validate add-loop-eval-live-mode --strict` green.
