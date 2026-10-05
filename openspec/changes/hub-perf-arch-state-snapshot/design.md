# Design — what the hub showed, what was changed, what the lab says

Fleet task `6124c147537b4865bf43a6fdcd1f01e4`. Measured on the hub (DESKTOP-POAPPP3, build
`c3d76cdd`, 2026-10-05) and in a lab on the same machine: Release builds of `main@c3d76cdd`
("before") and this branch ("after"), each booted with a copy of the hub's live store (the
real 19 repos — so git reads are the real thing — the real 15 docks and arch scope), the dead
peer Pavlin as the **only** remote source (with the arch's fleet keys for it), and the
dashboards' polling mix replayed for 150 s (`.claudeweb-preview/playwright/perf-arch-state.mjs`,
not committed).

## 1. Evidence from the hub

### 1a. The symptom, as logged

| | count | note |
|---|---|---|
| `[ARCH] state took …` (GET /api/arch over 1 s) | 1,499 | avg **4,441 ms**, max **38,406 ms**, 879 over 2 s; 6,657 s of request time in 103 min |
| `[COLLECTOR] source Pavlin: unreachable — timed out` | 1,744 | one per 2.5 s poll pass |
| `[FLEET] GET /api/arch/peer/requests … timed out` | 256 | the Repo Agent Requests tab's peer pull, **on the request path**, 8 s each |
| `[FLEET] GET /api/arch/peer/files … timed out` | 57 | hub files across peers |
| `[GIT] Status …` computations | 9,246 | ≈ 90/min, 9–17 git processes each |

Every slow line had the same shape: `state took 18904 ms (agents 18830, fleet 0, home commits 71,
session 0)` — all of it in `ListAgents`.

### 1b. Where the request threads actually were

`dotnet-stack report` on the live process, four samples three seconds apart while the Arch tab
and Fleet Status polled:

| sample | threads in `git.exe` | in `LocalAgents` | in `BuildState` (/api/arch) | in `FleetStatus` | in `FleetClient` |
|---|---|---|---|---|---|
| 1 | 2 | 4 | 0 | 8 | 0 |
| 2 | 1 | 4 | 2 | 2 | 0 |
| 3 | 2 | 1 | 1 | 2 | 0 |
| 4 | 3 | 4 | 2 | 2 | 0 |

The frames above `RunGitCore` were always `GitService.Status → ComputeStatus` (status,
rev-parse, rev-list, `ListBranches`, `ReadCommitIdentity`, `CompareToOriginBase`) ←
`ArchAgentService.ReadGitState` ← `ReadGitStateCached` ← `LocalAgents`. **No thread was in the
fleet client.** `RemotePosture(nonBlocking: true)` already read `FleetClient.SnapshotNonBlocking`,
which never dials on the caller's thread — the brief's "RemotePosture still awaits the network
call" was not what the hub was doing.

### 1c. Why git made a 4–38 s request

- `LocalAgents` walks the include set **serially**: 8 managed repos for `/api/arch`, 15 (managed
  ∪ docked) for `/api/arch/fleet/status`.
- Each repo's `ReadGitStateCached` has a 20 s TTL; a `GitService.Status` is 9–17 git processes
  behind a global **4-slot** spawn gate shared with every dock's git row, the engine tick and
  each peer describing this box.
- The cache was not single-flight: when it expired, the Arch tab poll, two fleet-status polls
  and the engine tick all missed together and all queued on the per-dir status lock.
- At ~90 status computations a minute, git on this box takes 0.5–2 s per repo under
  contention. Fifteen repos × ~1.2 s ≈ 18 s — exactly the `agents 18830` lines.

### 1d. What the dead peer did cost

Not the request thread's time, but: a 6 s timeout on every 2.5 s collector pass (so the
collector pass itself ran back-to-back), a background describe timing out every 10 s, and — on
the request path — the requests tab's peer pull waiting out 8 s per read (256 times today), plus
57 hub-files pulls.

## 2. The changes

### 2a. The agent snapshot (brief b)

| piece | before | after |
|---|---|---|
| `ArchAgentService.ListAgents(nonBlocking: true)` | `LocalAgents(managed)` on the request thread | the snapshot's local views filtered to the managed set; remote views as before (cached describes) |
| `ArchAgentService.FleetStatus()` / `SelfOverview()` | `LocalAgents(managed ∪ docked)` on the request thread | the snapshot |
| new `AgentSnapshotWorker` (hosted) | — | every 10 s: `RefreshAgentSnapshot()` — git states for the include set warmed with `Parallel.ForEach` (degree 4, i.e. the spawn gate), then one `LocalAgents` pass; single-flight; logs a pass over 5 s |
| first request before the first pass | — | computes the snapshot once (no empty Arch tab) |
| `GET /api/arch`, `GET /api/arch/fleet/status` | — | `agentsAt`, `agentsTookMs` |
| `ReadGitStateCached` | TTL only | TTL + per-repo gate: concurrent misses share one read |
| `list_agents` tool, engine tick | fresh | unchanged (fresh; the tick's reads hit the cache the worker keeps warm) |

### 2b. Dead sources (brief a, c)

| piece | before | after |
|---|---|---|
| `CollectorService.PollActiveSourcesAsync` | every active source every pass | a source whose `NextPollAtMs` is in the future is skipped |
| `SetState(unreachable)` | status + one log line per pass | `FailStreak++`, `NextPollAtMs = now + BackoffMs(streak)` (8 s, 16, 32, 64, 120 s cap); log on the first failure, each step, every 25th at the cap; "reachable again after N failed polls" on recovery |
| `SourceView` | — | `NextRetryAtMs`, `FailStreak`; `Backoff(sourceId)` query |
| `FleetClient.Snapshot` / `SnapshotNonBlocking` | dial when the cache is older than 5 s / 10 s | `KnownDead` first: collector backing off → `unreachable` without a dial (synthesized and stored once); cached `unreachable` under 60 s → served |
| `FleetClient.Get` (requests pull, hub files, loops, upgrade status, scoreboard) | dial, 8 s timeout | `unreachable` at once while the collector backs off, with the next-try time |
| `FleetClient.Post` (send, decision, loop, upgrade) | dial | dial — an act gets a real answer |
| Fleet Status machine, Arch tab Fleet card | "not answering" | reason · "N polls in a row" · "retry in N s" |

### 2c. Client polling (brief d)

See §4. Two code changes: `apiGet` coalesces identical in-flight GETs (URL + repo header), and
the two remaining unguarded network pollers (`useAppBuild`, `useLocalAppDiscovery`) skip
hidden tabs.

## 3. Before / after (lab)

Both builds, same store copy, same 150 s mix (`/arch` every 3 s, `/arch/fleet/status` ×2 every
5 s, `/arch/requests` every 5 s, taskgraph, policeman, activity, runs, loops ×3, analytics,
recurring, traffic — ~2.8 req/s), the dead peer as the only remote source.

The after column is the final build (two warm-up threads); the second figure, where given, is
the run of the same code with four warm-up threads — the box is shared (the live hub, its
browsers and this session all run on it), so the same binary varies run to run, and the range
is the honest number.

| | before (`c3d76cdd`) | after (this branch) |
|---|---|---|
| `GET /api/arch` first call after boot | **11,560 ms** | **90 ms** (59) |
| `GET /api/arch` p50 / p95 / max | 689 / **4,120** / 7,370 ms | **10 / 388 / 510 ms** (5 / 54 / 317) |
| `GET /api/arch/fleet/status` p50 / p95 / max | 1,483 / **9,820** / 9,844 ms | 76 / 870 / 1,272 ms (69 / 789 / 845) |
| `GET /api/arch/requests` p50 / p95 / max | **8,010 / 8,016 / 8,016 ms** (dials the dead peer every read) | **1 / 3 / 5 ms** |
| other endpoints p95 | 2–32 ms | 4–66 ms |
| process CPU under the mix | 18 % of one core, 70 ms/request | 18 % (12 %), 64 ms/request |
| RSS at the end | 250 MB | 266 MB |
| `[GIT] Status` computations in 150 s | 132 | 115 (the worker's floor: 15 repos per 20 s) |
| `[COLLECTOR] … unreachable` lines in 150 s | 22 | 4 (8 s, 16, 32, 64 — then silence) |
| `[FLEET] … timed out` in 150 s | 12 | **0** |
| `[ARCH] state took` (over 1 s) | 17 | **0** |
| `[ARCH] agent snapshot took` (over 5 s, off the request path) | — | 3 |

For scale: the hub itself logged **avg 4,441 ms / max 38,406 ms** for `GET /api/arch` this
morning under two browsers; the lab's single mix reproduces the shape (seconds, with
10 s maxima on fleet status) at a lower load.

CPU did not move much in the lab, and that is expected: the git work is the CPU, and it still
happens — in the worker, once per repo per 20 s, instead of on request threads with
duplicate misses. What moved is *where the time is spent*: no request waits on it. The
remaining `/arch` tail (p95 0.05–0.4 s) is the 15 s home-commits cache missing while a
snapshot pass holds two of the four git slots.

An intermediate build warmed the git states with `Parallel.ForEach` on pool threads: `/arch`
p95 was 485 ms and every cheap endpoint's p95 doubled (thread-pool starvation while four pool
threads sat in git), and `/arch/requests` still hit an 8 s timeout once per backoff step (the
pull dialled in the gap between the step's expiry and the collector's next pass). Dedicated
threads for the warm-up and "backing off = the collector last saw it unreachable" are the
result of that run.

## 4. Polling audit — one dashboard browser

| surface | poller | cadence | hidden-tab guard | change |
|---|---|---|---|---|
| Arch tab | `/arch` + `/autopilot/loops` + `/arch/messages` | 3 s | yes | served from the snapshot |
| Fleet Status tab | `/arch/fleet/status` | 5 s | yes | served from the snapshot |
| Kanban | `/taskgraph` + `/arch/fleet/status` + `/notes` | 5 s | yes | fleet status coalesced with the Status tab's when both are open |
| Recurring tab | `/recurring` 5 s + `/arch/fleet/status` 30 s | | yes | — |
| Repo Agent Requests tab | `/arch/requests` (pulls peers every 10 s) | 5 s | yes | a backed-off peer answers at once |
| Management App shell | `/recurring` (tab badge) | 15 s | yes | — |
| Management App tabs | | | **unmounted when hidden** (tabs mode) | — |
| Dashboard | `/sessions/activity` + `/runs` | 5 s | yes | — |
| Dashboard, per dock ×15 | `/autopilot/loops` (`useQueueLoopStatus`) | 10 s | yes | 15 per tick → **1** (coalesced) |
| Dashboard, per dock ×15 | `/github-account?repoId` (`DockIdentityRows`) | 10 s | yes | — (per repo; server cache 5 s) |
| Dashboard, per dock | `/git/status` | mount + manual refresh | n/a | — |
| Dashboard, per dock | app build / local-app discovery | 5 s while a job runs | **added** | skips hidden tabs |
| Dashboard panels | Scoreboard, AccountChips ×2, AdminStatus, Watchdog, HostClock, EventConsole, Traffic, Autopilot, HandToArch, Policeman | 4–8 s each | yes | — |
| Chat page | `UnderstandingPanel` `/files/read` | 5 s | yes | — |
| Files tab | `/files/read` or `/files/raw` | 5 s | yes | — |

Where the "~12 req/s from one browser" came from: the Dashboard with 15 docks is ~12 panel
pollers at 5 s (2.4/s) plus 15 × 2 per-dock pollers at 10 s (3/s); with the Management App
open in panes mode beside it, 5–8 more at 3–5 s (2/s); two browsers double it. The
coalescing removes the ×15 on `/autopilot/loops`; the rest are distinct URLs. What made
12 req/s *hurt* was not the count but that three of them (arch state, two fleet statuses)
each held a thread for seconds and the git gate for all of it.

## 5. Not changed here

- **`git.exe` is still the largest load on the box** (~90 status computations a minute).
  The snapshot removes it from the request path and the single-flight removes duplicate
  computations; what remains is one `Status` per managed/docked repo per 20 s from the worker,
  plus each peer's describe of this box and the docks' own rows. A cheaper `Status` (one
  `git status --porcelain=v2 --branch` instead of 9–17 processes, with the ahead/behind and
  identity reads cached longer) is the next step and its own change.
- **`GET /api/arch/fleet/status` keeps a ~70 ms median and a ~0.8 s tail** in the lab after
  the snapshot (from 1.5 s / 9.8 s). It is not git any more: the remaining per-call work is
  the by-account fold (`FleetAccountsStore.Record` re-serializes and, because `lastSeenAt`
  moves every pass, rewrites `fleet-accounts.json` on every poll), the stale-task scan over
  the board, and the per-agent goal/occupancy views. A write-at-most-once-a-minute rule on the
  accounts store is the obvious next cut; it is a separate behaviour and left out here.
- The Dashboard's per-dock `/github-account` rows (distinct per repo).
- The Management App panes mode polls every open pane; that is what the Operator asked to see.

## 6. Why these shapes

- **A worker and a snapshot** rather than a longer git cache: the request path must never
  depend on how many repos there are or how slow git is today; a 10 s-old view is what a 3 s
  poll of a 20 s cache already showed.
- **Parallel warm-up inside the worker** rather than parallel `LocalAgents`: the view-building
  is cheap and ordered; only the git reads are slow, and the spawn gate already bounds them.
- **The collector as the one liveness monitor**: it already polls every source every 2.5 s with
  a timeout and a status; the fleet client defers to it instead of running a second detector.
- **Reads short-circuit, acts dial**: a polling read that waits 8 s on a known-dead peer is
  pure cost; a send that is refused for up to two minutes after a peer came back would be a
  wrong answer, so acts still dial (and their success resets nothing — the collector's next due
  poll does).
- **Coalescing in `apiGet`** rather than per-component plumbing: it fixes every present and
  future duplicate at one point, and a settled request is never reused, so nothing goes stale.
