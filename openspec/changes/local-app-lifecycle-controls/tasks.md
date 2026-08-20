## 1. buildCommand through the discovery pipeline

- [x] 1.1 `LocalAppExposureReport`: add optional `buildCommand` to
      `LocalAppFinding` (`[JsonPropertyName]` + `[Description]` so the prompt
      schema self-updates; empty = unknown, never fails parse). Confirm old
      cache files / import payloads without the field still parse to `""`.
- [x] 1.2 Thread `buildCommand` through the projections: `LocalAppsController`
      `JobBody` + `CacheBody` rows, and the panel's Export JSON
      (import-contract fields now include `buildCommand`).

## 2. Backend lifecycle actions

- [x] 2.1 `LocalAppRunner`: portâ†’owning-PID resolution
      (`Get-NetTCPConnection -State Listen -LocalPort`), self-protection guard
      (refuse `Environment.ProcessId` + current parent chain), and
      `taskkill /PID /T /F` process-tree stop â€” per design D1/D2.
- [x] 2.2 `LocalAppsController` `POST /stop {port}`: repo-scoped finding lookup
      (same as Run), explicit errors for nothing-listening / port-not-in-cache /
      self-kill refusal; Event Console emissions with resolved PID.
- [x] 2.3 `LocalAppsController` `POST /restart {port}`: stop-if-running â†’
      bounded wait for port free (250 ms / ~10 s) â†’ detached `Launch` of the
      cached `startCommand`; explicit error (no launch) on stop failure or
      wait timeout; plain start when not running; per-phase events.
- [x] 2.4 `LocalAppBuildJobs` registry (start-or-join keyed repo+port, own CTS,
      disconnect-proof, patterned on `LocalAppDiscoveryJobs`): runs
      `buildCommand` in the app folder with redirected stdout+stderr (bounded
      ~8 KB tail, truncation marked), records exit code + timing; DI singleton.
- [x] 2.5 `POST /rebuild {port}` (start-or-join; explicit error when no build
      command) and per-row `rebuild` state (`running|succeeded|failed`,
      exitCode, tail, finishedAt) embedded in `JobBody`/`CacheBody` so the
      panel's existing poll carries it; started/succeeded/failed events.

- [x] 2.6 `LocalAppBuildCommandAsk` backfill (design D6): typed
      `{port, buildCommand}` report + prompt enumerating the cached findings
      missing a build command, sent through the same `ClaudeMonitor` gateway /
      read-only policy / extract-parse-retry machinery as discovery; parse
      rejects ports outside the enumerated set.
- [x] 2.7 Backfill endpoint + job: `POST /backfill-build-commands` runs the ask
      as a disconnect-proof start-or-join job; merge updates ONLY
      `buildCommand` on matching ports (other fields + discovery times
      untouched); explicit nothing-to-do outcome (no agent call) when no cache
      or nothing missing; events for started/merged/failed.

## 3. Panel UI

- [x] 3.1 Local Apps panel rows: Stop / Restart / Rebuild actions beside
      register / Run / Check â€” Stop needs `running`, Run/Restart need
      `startCommand`, Rebuild needs `buildCommand`; unavailable = disabled,
      not failing.
- [x] 3.2 Rebuild state on the row: in-flight indicator while `running`,
      success/failure badge with expandable captured output after; i18n keys
      (en/tr) + CSS for the new actions and states.
- [x] 3.3 "Find build commands" panel action (Advanced): visible job in-flight
      state + outcome, disabled with a nothing-to-do hint when no finding
      lacks a build command.
- [x] 3.4 Activity section in the panel (design D8): newest-first feed of the
      repo event log filtered to local-app kinds (run/stop/restart/rebuild/
      backfill/check/cache), phase + detail per entry, watermark fetch on the
      panel's existing poll cadence; shows pre-open/server-side history too;
      i18n + CSS.

## 4. Verify

- [x] 4.1 Backend e2e on an isolated harness (side port, own data dir, fixture
      repo with a real tiny servable app): stop kills a listener started
      outside the harness; stop on dead port / un-cached port / self-PID all
      explicitly rejected; restart cycles the process (new PID, port live);
      rebuild captures output + exit code for a passing AND a failing build,
      survives client disconnect, and start-or-joins concurrent requests.
- [x] 4.1b Backfill e2e (stub or real gateway): pre-buildCommand cache file â†’
      backfill fills only missing `buildCommand`s by port (other fields +
      times byte-identical), empty answers recorded as empty, out-of-set port
      rejected by the parse, nothing-to-do short-circuits without an agent
      call.
- [x] 4.2 Playwright verify script on the isolated instance: rows gate the
      three actions on running/startCommand/buildCommand; Stop flips the
      running dot; rebuild shows in-flight then outcome with output; export
      JSON round-trips `buildCommand` through import; clicking Run/Stop makes
      the action's startedâ†’done (or error) events appear in the panel's
      activity section without reopening, and reopening still shows them.
- [x] 4.3 `openspec validate local-app-lifecycle-controls --strict` passes;
      honesty pass on proposal/design/spec wording vs what was actually built.


