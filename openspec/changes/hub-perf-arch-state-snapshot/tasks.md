## 1. Measure first

- [x] 1.1 Today's hub log: `[ARCH] state took` distribution (1,499 calls, avg 4,441 ms, max 38,406 ms, 879 over 2 s), `[COLLECTOR] source Pavlin: unreachable` (1,744), `[FLEET] … timed out` (314), `[GIT] Status` (9,246 in 103 min)
- [x] 1.2 `dotnet-stack` samples of the live process during slow calls: request threads in `LocalAgents → ReadGitStateCached → GitService.Status → git.exe`, none in the fleet client — `design.md` §1
- [x] 1.3 Lab harness `perf-arch-state.mjs`: live-store copy, real repos and docks, the dead peer as the only remote source, the dashboards' polling mix for 150 s; before/after on Release builds of `main@c3d76cdd` and this branch

## 2. The agent snapshot (b)

- [x] 2.1 `ArchAgentService.AgentSnapshot` + `RefreshAgentSnapshot()` (single-flight, git states warmed with `Parallel.ForEach`, degree 4)
- [x] 2.2 `AgentSnapshotWorker` hosted service, every 10 s; registered in `ArchModuleExtensions`
- [x] 2.3 `ListAgents(nonBlocking: true)`, `FleetStatus()` and `SelfOverview()` serve the snapshot; first request before the worker's first pass computes it once
- [x] 2.4 `GET /api/arch` and `GET /api/arch/fleet/status` carry `agentsAt` / `agentsTookMs`
- [x] 2.5 `ReadGitStateCached` single-flight per repo

## 3. Dead sources (a, c)

- [x] 3.1 `CollectorService`: `FailStreak` / `NextPollAtMs` per source, `BackoffMs(streak)` 8 s → 16 → 32 → 64 → 120 s cap, skipped in the poll pass until due, log once per step + on recovery; `SourceView.NextRetryAtMs` / `FailStreak`; `Backoff(sourceId)` query
- [x] 3.2 `FleetClient`: `KnownDead` — the collector's backoff or a fresh (< 60 s) `unreachable` verdict answers `Snapshot` / `SnapshotNonBlocking` without a dial; `Get` answers `unreachable` at once while backing off; `Post` still dials
- [x] 3.3 Surface it: `fleet/status` machines carry `collector { status, detail, failStreak, nextRetryAt }`; arch state `fleet.sources[]` carry `failStreak` / `nextRetryAt`; Fleet Status machine header and the Arch tab's Fleet card render reason + countdown
- [x] 3.4 Unit tests for the backoff schedule (`CollectorBackoffTests`)

## 4. Client polling (d)

- [x] 4.1 `apiGet` coalesces identical in-flight GETs (URL + repo header)
- [x] 4.2 `useAppBuild` / `useLocalAppDiscovery` pollers skip hidden tabs
- [x] 4.3 Audit table of every poller, cadence and guard — `design.md` §4

## 5. Verify

- [x] 5.1 .NET tests 690 green, client tests 184 green
- [x] 5.2 `perf-arch-state.mjs` before/after: `/arch` p95 4,120 → 54 ms, first call 11.6 s → 59 ms; `/arch/requests` p50 8,010 → 1 ms; fleet timeouts 12 → 0; CPU 18 % → 12 % — `design.md` §3
- [x] 5.3 `openspec validate hub-perf-arch-state-snapshot --strict` — valid
- [x] 5.4 Understanding app (`understanding-app/`): the poll model, the hub evidence, the backoff, before/after, the polling audit
- [x] 5.5 Screenshots of the dark machine on Fleet Status and the Arch tab's Fleet card from a lab boot of this build (`docs/screenshots/arch-state-dead-peer-*.png`)
