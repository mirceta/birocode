## 1. Backend: scan extracts the start command

- [x] 1.1 Add `startCommand` to `LocalAppFinding` (`[JsonPropertyName("startCommand")]` + `[Description]`); keep it OPTIONAL (no validation in `Parse` — empty allowed) so a missing command never fails the parse
- [x] 1.2 Update the `LocalAppDiscoveryAsk` prompt to ask for the launch command (read from the file/line where the port is bound; empty string if unknown)

## 2. Backend: port liveness + launch service

- [x] 2.1 Add a port-liveness helper that returns whether a loopback port has a TCP listener via `IPGlobalProperties.GetActiveTcpListeners()` (in-process, no shell)
- [x] 2.2 Add a runner that launches a finding's `startCommand` detached (`powershell.exe -NoProfile -Command <cmd>`, `WorkingDirectory` = repo+folder, `CreateNoWindow`, not awaited)
- [x] 2.3 Register the new service(s) in DI (`StructuredAskModuleExtensions`)

## 3. Backend: status projection + run endpoint

- [x] 3.1 `LocalAppsController.JobBody`: add `startCommand` and a harness-computed `running` (port liveness) to each projected app
- [x] 3.2 Add `POST /api/local-apps/run { port }`: resolve caller's repo, find the scanned finding by port in its latest `DiscoveryJob`, launch its `startCommand`; explicit `400` when no completed scan / no matching finding / no command; return `{ ok, port }`

## 4. Frontend: Run + Check + running indicator

- [x] 4.1 `PinnedAgent.jsx` discover rows: render a live running indicator from `running`; add a Run button (POST `/run`, then auto re-check after a short grace; disabled when running or no `startCommand`) and a Check button (re-fetch status)
- [x] 4.2 i18n keys (en + tr) for run/running/check/notRunning/run errors
- [x] 4.3 CSS for the running dot + Run/Check buttons; preserve the existing Register flow unchanged

## 5. Understanding app + docs

- [x] 5.1 Refresh `understanding-app/index.html` for the discover → check → run loop (build-less, vendored, relative URLs)
- [x] 5.2 Confirm CLAUDE.md/docs references stay accurate (no `plan.md` edits — frozen); no convention changed

## 6. Verify

- [x] 6.1 Build frontend + .NET build clean
- [x] 6.2 Verified. **Live machinery** (`runnercheck`, against the REAL compiled `LocalAppRunner.dll`): `IsListening` false for a free port, true for the external `:5123` gateway; `Launch` starts a detached PowerShell HttpListener in the given folder that then becomes listening — the run→check loop. **Frontend** (`verify-run-controls-ui.mjs`, Playwright on isolated `:5201`, status+run stubbed): running app shows green dot + no Run; down+runnable shows enabled Run; app with empty `startCommand` shows DISABLED Run; clicking Run POSTs `{port:5305}`, then the auto-Check flips the dot green; Check re-fetches and re-derives a now-down app. **Backend endpoint** (real, no agent): `POST /run` with no completed scan → `400 "No completed discovery…"`. **Understanding app** Demo C renders with no JS errors; Run→dot flips, no-command Run disabled. *The `/run` happy-path through a live agent scan + real app launch — its components (projection `running`, lookup-by-port, `Launch`) are each verified above — was confirmed working end-to-end by the operator on live :5099 (2026-06-26).*
- [x] 6.3 `openspec validate discover-local-apps-run-controls --strict` → valid
