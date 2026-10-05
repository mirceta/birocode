# Arch state off the request path: the agent snapshot, dead-peer backoff, coalesced polling

Fleet task `6124c147537b4865bf43a6fdcd1f01e4` (Operator-approved request from the busi-dec agent,
2026-10-05). Follow-on to `hub-perf-log-path` (PR #137).

## Why

On the hub `GET /api/arch` (the Arch tab's state, polled every 3–6 s by each open dashboard)
averaged **4.4 s** and peaked at **38 s** — 1,499 calls and 6,657 s of request time in one
morning, almost all of it inside `ListAgents`. Everything proxied through the harness queued
behind it, and the process sat at 130–140 % CPU again.

The brief attributed it to the dead fleet peer (Pavlin, 192.168.0.40) being dialled on every
poll. Measured on the hub (`dotnet-stack` samples of the live process during slow calls), the
request thread was never in the fleet client: it was in **`LocalAgents → ReadGitStateCached →
GitService.Status → git.exe`** — the arch's per-repo git walk, 9–17 git processes per repo, run
*serially* for the 8 managed repos (15 with docks, for the Fleet Status poll), behind a
4-process spawn gate shared with every other git reader. `RemotePosture` already honoured
`nonBlocking` (the peer describe runs in the background). The dead peer did cost something
real, just elsewhere: the collector dialled it every 2.5 s pass and timed out every pass
(1,744 log lines a day), background describes timed out every 10 s, and the Repo Agent
Requests tab's peer pull — on the request path — waited out an 8 s timeout per read
(256 `timed out` lines).

## What changes

- **The agent snapshot.** A hosted worker recomputes the local agent views (managed ∪ docked
  repos, git states warmed in parallel) every 10 s; `GET /api/arch`, `GET /api/arch/fleet/status`
  and the header's self overview serve the last snapshot. The payloads carry `agentsAt` and
  `agentsTookMs`. The `list_agents` tool still reads fresh.
- **Git state single-flight.** Concurrent misses on one repo's 20 s git-state cache share one
  read instead of each spawning git.
- **Dead-source backoff in the collector.** An unreachable source is next dialled after 8 s,
  then 16, 32, 64, then every 2 minutes, and the log says so once per step (plus a
  "reachable again after N failed polls" line) instead of once per pass. The source view
  carries `failStreak` and `nextRetryAt`.
- **The fleet client honours it.** While the collector backs a source off, the peer snapshot
  is `unreachable` without a dial, an `unreachable` verdict is otherwise kept for 60 s, and
  peer **reads** (requests pull, hub files, loops, upgrade status) answer `unreachable` at once.
  Peer **acts** (send, decision, upgrade) still dial.
- **The dashboards say so.** Fleet Status names the reason, the failed-poll count and the
  retry countdown on a dark machine; the Arch tab's Fleet card shows the same on the source row.
- **Client polling audit.** Identical GETs in flight share one request (fifteen docks asking
  `/autopilot/loops` on one tick were fifteen round trips); the two remaining unguarded
  network pollers skip hidden tabs. The audit table is in `design.md`.

## Not changed

The per-dock git rows' own `GET /api/git/status` (mount + manual refresh only), the
Management App's pane model (hidden tabs are unmounted already), and `git.exe` itself as the
largest remaining load on the box — see `design.md` §5.
