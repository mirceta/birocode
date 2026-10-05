# Design — measured on the live hub, fixed, measured again

Fleet task `1a17afbe36a1453886de05ed90391391`. Hub: DESKTOP-POAPPP3, build `4c80b675` (PR #137
and PR #140 already live), 2026-10-05.

## 1. How it was measured, and what "live" means here

| What | Where | How |
|---|---|---|
| Every request the hub served, 245 s, under the Operator's real browsers | **the live process** | `tools/livetrace` — attaches over the .NET diagnostics channel (EventPipe) and listens to Kestrel's `Request/Start` / `Request/Stop` events. Read-only; no login. 2,005 requests, 8.2/s |
| What the slow requests were blocked on | **the live process** | `dotnet-stack report`, 8 samples 2 s apart |
| Snapshot passes, slow-state lines since the deploy | **the live log** | `run-bin/logs/claude-web-2026-10-05.log` after the 14:49:40 restart |
| Cost of one git process in each docked repo | **the hub's disk** | `git status` / `git rev-parse` timed in the 15 real repos |
| The network waterfall, paint times, script/layout time | a real browser (headless Chromium) against **the same build over a same-minute copy of the live store** | `.claudeweb-preview/playwright/board-waterfall.mjs`: the real 85 cards, 15 docks, 8 managed repos, 31 fleet agents, all 6 peers polled read-only. CDP `Network.*` for wire vs decoded bytes, encodings, cache |
| The dashboards' polled calls on the server, before/after | the same lab instance | `board-server-mix.mjs`: 120 s of the polling mix incl. one claim poll per dock and the watchdog tile |

A browser session on the live hub itself needs the Operator's login. An agent does not hold
one — sessions and the password are stored hashed — and forging one is not something to do.
So the browser runs use the hub's *data and repos* (a copy taken the same minute, on the same
disk, with the same peers) rather than its process; the process itself was measured with the
tracer. The "LAN" rows throttle Chromium to 25 Mbit/s and 10 ms and are a model of a browser
that is not on the hub.

## 2. What the live hub showed

### 2a. Server time by request (live trace, 245 s, 394 s of server time in total)

| request | calls | p50 | p95 | max | server time | blocked on (stacks) |
|---|---|---|---|---|---|---|
| `GET /api/arch/claim` | 166 | 4 ms | **10,028 ms** | 15,333 ms | 264 s (**67 %**) | `GitService.ComputeStatus → git` |
| `GET /api/arch/fleet/status` | 40 | **547 ms** | **4,517 ms** | 5,605 ms | 45 s (11 %) | `FleetOverviewProvider.ReadWatchdog → WatchdogProbe → schtasks.exe` |
| `GET /api/git/status` | 5 | 7,203 ms | 9,784 ms | 9,784 ms | 34 s (9 %) | git, 9–11 processes |
| `GET /api/arch` | 62 | 9 ms | 2,830 ms | 3,989 ms | 19 s (5 %) | `RecentHomeCommits → git log` |
| `GET /api/openspec/cockpit` | 2 | 8,518 ms | | | 16 s | the openspec CLI |
| `GET /api/branch` | 5 | 923 ms | 3,824 ms | | 7 s | one git process |
| `GET /api/taskgraph` | 42 | **2 ms** | 5 ms | 43 ms | 0.1 s | — |

The log agrees: since the deploy, `state took … (agents 1, fleet 0, home commits 2108)` —
the agent listing is 1 ms now (PR #140), the home-commit read is what stalls; and 52 snapshot
passes took **17.3 s on average, 75 s at worst**.

### 2b. Why a process spawn is the common factor

Timed on the hub in the 15 docked repos: one `git status` took 30–100 ms in most, **1.4 s and
2.9 s** in two; a trivial `git rev-parse` took 30–45 ms — or **0.9–1.1 s** in six of fifteen
runs. A spawn on this machine, under the live load (the docks' own agents, their git, the
CLI sessions), costs anything from 30 ms to several seconds. A git status was 9–11 spawns.
Every slow endpoint above is a polled call that spawned one or more processes on its request
thread. An idle lab box does not show it, which is why the earlier lab runs looked fine.

### 2c. In the browser (live build, real data)

- **First load after a restart: no card within 90 s.** `/api/taskgraph` answered in 43 ms.
  `/api/arch/fleet/status` and `/api/arch` did not answer: no agent snapshot existed yet, and
  a request that finds none waited for the worker's first pass. The Kanban awaits
  `Promise.all([taskgraph, fleet status, ideas])`, so it painted nothing. Every later poll of
  the fleet status **joined the hung request** (the in-flight coalescing PR #140 added) instead
  of sending its own. With the LAN model the first card came after 33.6 s.
- **Reload, snapshot ready: 0.4 s on the hub, 2.9 s on the LAN model** — 2,002 KB per load,
  1,666 KB of it the Management App's script and stylesheet, `no-store`, uncompressed.
- **An open Kanban moves 3.8 MB a minute**: the 295 KB board every 5 s, never compressed.
- **Rendering is not it**: 61–107 ms of script and 64–115 ms of layout; 8 cards in the DOM
  (the visible ones) and 642 nodes. No virtualization is called for.

## 3. The fixes

| # | finding | change |
|---|---|---|
| 1 | The Kanban waits for the fleet status | `KanbanBoard.load`: the board is set when `/taskgraph` answers; fleet status and ideas resolve on their own |
| 2 | `schtasks` per fleet-status poll and per watchdog-tile poll | `WatchdogProbe`: result cached 15 s, one background renewal at a time, first read and the read after `Invalidate()` (called after the installer) probe inline |
| 3 | A request waits for the first snapshot pass | `AgentSnapshotOrCompute`: no snapshot → a provisional one from `LocalAgents(noGit: true)` (branches "unknown", `agentsAt` 0), never stored, never a wait |
| 3b | A hung request captures later polls | `apiGet`: join an in-flight GET only while it is younger than `JOIN_WINDOW_MS` (4 s) |
| 4 | `claim` runs git per call | `ClaimPosture` → `PeekGitState`: the cached state whatever its age (the worker renews docked repos), a background read when missing |
| 4b | `GET /api/arch` stalls on the home commits | `RecentHomeCommits`: stale-while-revalidate |
| 5 | A git status is 9–11 processes | `DetectBases`: one `git for-each-ref` for the four candidate refs; `ReadCommitIdentity`: one `git config --show-scope --get-regexp` parsed by `ParseCommitIdentity` (old path kept as the fallback). At most 5 processes |
| 6 | No compression | `AddResponseCompression` (Brotli + gzip, fastest) for JSON, JS, CSS, HTML, SVG; not `text/event-stream`, not `text/plain` |
| 6b | The Management App is `no-store` | `HarnessStaticApp.Serve(immutableHashedAssets: true)` from `EventsApp`: `assets/*-<hash>.*` → `private, max-age=31536000, immutable`; `index.html` and the hand-written apps (Understanding, Goal, Lab) unchanged |
| 6c | 295 KB board per poll | `ConditionalJson.Result`: weak ETag of the serialized board + `private, no-cache`; unchanged → 304 |

## 4. Before / after

### 4a. In the browser — real board, real peers

| | live build | this branch |
|---|---|---|
| Kanban, first load after a restart — first card (browser on the hub) | **not within 90 s** | **707 ms** |
| Kanban, first load — LAN model | **33,564 ms** | **1,201 ms** |
| Kanban, reload — first card (hub / LAN model) | 403 ms / **2,934 ms** | 48 ms / **104 ms** |
| Kanban, reload — bytes on the wire | **2,002 KB** | **22 KB** |
| Kanban open for a minute — bytes on the wire | **3,786 KB** | **186 KB** |
| Management App bundle (script + stylesheet) | 1,666 KB on every load | 637 KB once, then 0 |
| Every other tab — first element, LAN model | 850–1,911 ms | 129–256 ms |
| Dashboard (`/studio`) — bytes on the wire, first load | 4,790 KB | 1,589 KB |
| Script + layout for the Kanban | 107 + 115 ms | 55 + 94 ms |
| Requests of a Kanban load / compressed / hung | 13 / 0 / 2 | 14 / 14 / 0 |

### 4b. On the server — the dashboards' polling mix, 120 s, same store, all peers

p50 / p95 / max:

| endpoint | live build | this branch |
|---|---|---|
| `GET /api/arch/claim` (one poll per dock) | 7 / **50,829** / 62,876 ms | 6 / **18** / 54 ms |
| `GET /api/arch/fleet/status` | **1,234** / 5,698 / 7,142 ms | **5** / 9 / 59 ms |
| `GET /api/watchdog/status` | 1,924 / 5,726 / 5,726 ms | 2 / 10 / 22 ms |
| `GET /api/arch` | 12 / 1,721 / 2,464 ms | 11 / 32 / 34 ms |
| `GET /api/arch`, first call after boot | 2,667 ms | 53 ms |
| `GET /api/taskgraph` | 4 / 18 / 29 ms | 8 / 33 / 50 ms |
| claim polls completed in 120 s | 107 | 224 |
| `[ARCH] state took` lines (a poll over 1 s) | 5 | 0 |

The lab's "before" has the same shape as the live trace (claim tails in the tens of seconds,
fleet status around a second), which is what makes the "after" column credible for the hub.
The server mix was run on the fixed build before the conditional board GET was added; that
change touches only `/api/taskgraph`.

### 4c. To confirm on the hub after a deploy

```
dotnet run -c Release --project tools/livetrace -- <hub pid> 240 after.jsonl
```

Expected: `/api/arch/claim` and `/api/arch/fleet/status` in single-digit milliseconds at
p50 and low tens at p95, no `/api/arch` row above ~50 ms, and the two rows together a few
seconds of server time instead of 309.

## 5. What is left

- `GET /api/git/status` (the docks' git rows, the Git tab) and `GET /api/branch` still run
  git on the request thread — on demand rather than polled, and now 5 processes instead of
  9–11. A stale-while-revalidate status for the dock rows is the next cut.
- `GET /api/openspec/cockpit` spawns the openspec CLI (8.5 s live, two calls in the trace).
- The Dashboard's own script is 2.2 MB (921 KB compressed); it was already cached
  (`immutable`), so only its first load pays.
- The board payload is still 295 KB (97 KB on the wire) when it *does* change; its notes are
  half of it. Sending notes only for an opened card would need the drawer to fetch them — a
  larger change the numbers no longer call for.

## 6. Why these shapes

- **Paint on the board's own data** rather than a faster fleet status alone: the two fixes are
  independent, and the first makes the board immune to whatever the second call does next.
- **A provisional snapshot** rather than "wait a little": a wait of unknown length on a polled
  path is exactly the failure; "unknown" for a few seconds is honest and bounded.
- **Cache the probe, not the endpoint**: the watchdog state changes when the Operator installs
  or removes it, and that path invalidates the cache.
- **One for-each-ref / one config call** rather than a longer status memo: the memo is already
  5 s and agents commit outside this service; fewer processes helps every caller, cached or not.
- **Compression at the server** rather than at the reverse proxy: the hub is also reached
  directly on the LAN, and the setting travels with the build to every fleet machine.
- **A join window on coalescing** rather than removing it: fifteen docks asking the same URL on
  one tick still share a request; only a request that is already late stops attracting callers.
