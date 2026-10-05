## 1. Measure (evidence first)

- [x] 1.1 Read the hub's own logs: per-day size, line count, `[IPFILTER] Admitted` and `[GIT]` counts (59 MB / 716k lines / 600k admissions on 2026-09-24) — `design.md` §1
- [x] 1.2 Read Windows' Application log for `ClaudeWeb.exe` crashes: `AccessViolationException` in `Control.WndProc` on 2026-09-17 04:19 and 2026-09-22 11:31
- [x] 1.3 Lab harness: `perf-measure.mjs` (endpoint latency/bytes, CPU under the dashboards' polling mix, RSS, page loads) and `perf-logpump.mjs` (the log path under N one-line requests) against a Release build of `main` with a copy of the live store
- [x] 1.4 Reproduce the crash in the lab: the unmodified build faults in `RichTextBox.WndProc` ← `ScrollToCaret` after 160k pumped lines

## 2. Log path

- [x] 2.1 `Logger`: buffered writer, 750 ms flush timer, flush on `Error()` and on `Close()`
- [x] 2.2 `MainForm`: queue + 250 ms drain, one `AppendText` per batch, box capped at 600k/400k chars, queue capped at 5000, coalesced counters
- [x] 2.3 `IpFilterMiddleware`: one `Admitted` line per address per 5 minutes with the request count

## 3. History- and uptime-scaled work

- [x] 3.1 `AutopilotAuditLog`: keep the newest 20k entries in memory; trim on append
- [x] 3.2 `ActivityLog.Read`: cache by `(Length, LastWriteTimeUtc)`
- [x] 3.3 `CollectorEvent.RepoId` read at append; `LocalAgents` groups events by repo once; `ArchClaims`/`LatestTurnStart` use it
- [x] 3.4 `SessionService.GetActivity`: digest from the end of the cached transcript under its lock, no list copy
- [x] 3.5 `GET /api/taskgraph/policeman`: transcript tail only for `?card=`, default `take` 60
- [x] 3.6 Client: eight pollers skip ticks while `document.hidden`

## 4. Verify

- [x] 4.1 .NET tests (671) and client tests (184) green on the branch
- [x] 4.2 `perf-measure.mjs` after: 6 % of one core / 23 ms per request (was 9 % / 35 ms); RSS after the mix 258 MB (was 406); policeman 474 KB (was 1.48 MB) — `design.md` §3a
- [x] 4.3 `perf-pageload.mjs` before/after: pages unchanged (~100–200 ms warm) — §3b
- [x] 4.4 `perf-logpump.mjs` after: 400k lines with RSS flat at ~150 MB (admissions) / ~175 MB (`[FILE] Read` driver) and no crash; the unmodified build reached 918 MB at 320k on the same driver — §3c
- [x] 4.5 `openspec validate hub-perf-log-path --strict` — valid
- [x] 4.6 Understanding app for the findings (`understanding-app/`: pipeline model, evidence, pump chart, before/after)

## 5. Not in this change

- [ ] 5.1 `git status` spawn cache (own change) — §4
- [ ] 5.2 Policeman journal rewrite per pass, `TrafficStats` lock, unbounded per-session accumulators — §4
