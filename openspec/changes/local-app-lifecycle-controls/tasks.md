## 1. buildCommand through the discovery pipeline

- [ ] 1.1 `LocalAppExposureReport`: add optional `buildCommand` to
      `LocalAppFinding` (`[JsonPropertyName]` + `[Description]` so the prompt
      schema self-updates; empty = unknown, never fails parse). Confirm old
      cache files / import payloads without the field still parse to `""`.
- [ ] 1.2 Thread `buildCommand` through the projections: `LocalAppsController`
      `JobBody` + `CacheBody` rows, and the panel's Export JSON
      (import-contract fields now include `buildCommand`).

## 2. Backend lifecycle actions

- [ ] 2.1 `LocalAppRunner`: port→owning-PID resolution
      (`Get-NetTCPConnection -State Listen -LocalPort`), self-protection guard
      (refuse `Environment.ProcessId` + current parent chain), and
      `taskkill /PID /T /F` process-tree stop — per design D1/D2.
- [ ] 2.2 `LocalAppsController` `POST /stop {port}`: repo-scoped finding lookup
      (same as Run), explicit errors for nothing-listening / port-not-in-cache /
      self-kill refusal; Event Console emissions with resolved PID.
- [ ] 2.3 `LocalAppsController` `POST /restart {port}`: stop-if-running →
      bounded wait for port free (250 ms / ~10 s) → detached `Launch` of the
      cached `startCommand`; explicit error (no launch) on stop failure or
      wait timeout; plain start when not running; per-phase events.
- [ ] 2.4 `LocalAppBuildJobs` registry (start-or-join keyed repo+port, own CTS,
      disconnect-proof, patterned on `LocalAppDiscoveryJobs`): runs
      `buildCommand` in the app folder with redirected stdout+stderr (bounded
      ~8 KB tail, truncation marked), records exit code + timing; DI singleton.
- [ ] 2.5 `POST /rebuild {port}` (start-or-join; explicit error when no build
      command) and per-row `rebuild` state (`running|succeeded|failed`,
      exitCode, tail, finishedAt) embedded in `JobBody`/`CacheBody` so the
      panel's existing poll carries it; started/succeeded/failed events.

## 3. Panel UI

- [ ] 3.1 Local Apps panel rows: Stop / Restart / Rebuild actions beside
      register / Run / Check — Stop needs `running`, Run/Restart need
      `startCommand`, Rebuild needs `buildCommand`; unavailable = disabled,
      not failing.
- [ ] 3.2 Rebuild state on the row: in-flight indicator while `running`,
      success/failure badge with expandable captured output after; i18n keys
      (en/tr) + CSS for the new actions and states.

## 4. Verify

- [ ] 4.1 Backend e2e on an isolated harness (side port, own data dir, fixture
      repo with a real tiny servable app): stop kills a listener started
      outside the harness; stop on dead port / un-cached port / self-PID all
      explicitly rejected; restart cycles the process (new PID, port live);
      rebuild captures output + exit code for a passing AND a failing build,
      survives client disconnect, and start-or-joins concurrent requests.
- [ ] 4.2 Playwright verify script on the isolated instance: rows gate the
      three actions on running/startCommand/buildCommand; Stop flips the
      running dot; rebuild shows in-flight then outcome with output; export
      JSON round-trips `buildCommand` through import.
- [ ] 4.3 `openspec validate local-app-lifecycle-controls --strict` passes;
      honesty pass on proposal/design/spec wording vs what was actually built.
