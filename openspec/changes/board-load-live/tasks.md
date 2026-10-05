## 1. Measure on the live hub first

- [x] 1.1 `tools/livetrace`: every request the live process served for 245 s (2,005 requests) — `/api/arch/claim` 67 % of server time (p95 10 s), `/api/arch/fleet/status` p50 547 ms / p95 4.5 s, `/api/taskgraph` 2 ms — `design.md` §2a
- [x] 1.2 `dotnet-stack` on the live process: fleet status in `WatchdogProbe → schtasks`, arch state in `ReadHomeCommits → git`, claim in `ComputeStatus → git`
- [x] 1.3 Live log since the deploy: 52 snapshot passes, avg 17.3 s, max 75 s; `state took` lines are all "home commits"
- [x] 1.4 One git process timed in the 15 docked repos: 30 ms to 2.9 s — §2b
- [x] 1.5 Browser waterfall (headless Chromium, live build, same-minute copy of the live store, all real peers): first load never painted in 90 s; reload 2,002 KB; 3.8 MB/min steady — §2c

## 2. Server

- [x] 2.1 `AgentSnapshotOrCompute`: provisional snapshot without git instead of waiting for the first pass; `LocalAgents(noGit:)`
- [x] 2.2 `WatchdogProbe`: 15 s cache, background renewal, `Invalidate()` after the installer
- [x] 2.3 `ClaimPosture` → `PeekGitState`; `RecentHomeCommits` stale-while-revalidate
- [x] 2.4 `GitService.DetectBases` one `for-each-ref`; `ReadCommitIdentity` one `config --show-scope --get-regexp` (`ParseCommitIdentity`), fallback kept
- [x] 2.5 Response compression (Brotli/gzip; never event streams or plain text)
- [x] 2.6 `HarnessStaticApp.Serve(immutableHashedAssets:)` for the Management App's hashed files
- [x] 2.7 `ConditionalJson` (weak ETag, `private, no-cache`, 304) on `GET /api/taskgraph`

## 3. Client

- [x] 3.1 `KanbanBoard.load`: paint on `/taskgraph`; fleet status and ideas independent
- [x] 3.2 `apiGet`: join an in-flight GET only inside `JOIN_WINDOW_MS`
- [x] 3.3 Management App and Dashboard bundles rebuilt

## 4. Verify

- [x] 4.1 .NET tests 730 green (new `BoardLoadLiveTests`: identity parsing, hashed-asset rule, compressed MIME list, ETag matching); client tests 184 green
- [x] 4.2 Browser before/after, hub and LAN model — `design.md` §4a
- [x] 4.3 Server polling mix before/after — §4b
- [x] 4.4 `openspec validate board-load-live --strict`
- [x] 4.5 Understanding app (`understanding-app/`): the waterfall per build/network/load, the live trace, causes, numbers
- [ ] 4.6 After a deploy: rerun `tools/livetrace` on the hub and compare with §2a (the Operator's call — this change is neither merged nor deployed)
