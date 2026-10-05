# Design — what was measured, what was changed, what the numbers say

Fleet task `3bcaff3a537e430fa8620c8572edddbe`. Measured on the hub (DESKTOP-POAPPP3) and in a
lab on the same machine: two Release builds of this checkout — `main` at `82d92beb` ("before")
and this branch ("after") — each booted with a **copy of the hub's live store** (19 repos,
15 docks, the 55 MB autopilot audit, the real task graph and arch scope; peers off) under
`CLAUDEWEB_DATADIR`, on their own ports. Three scripts under `.claudeweb-preview/playwright/`
(not committed) drive them: `perf-measure.mjs` (endpoint latency, CPU under the dashboards'
polling mix, RSS, page loads), `perf-pageload.mjs` (page loads only, 5× each) and
`perf-logpump.mjs` (the log-path experiment: N requests that each write one log line,
sampled every 20k).

## 1. Evidence from the hub itself

**The log is the workload.** Per-day harness log on the hub (`run-bin/logs/`):

| Day | Size | Lines | `[IPFILTER] Admitted … via LAN bypass` | `[GIT]` |
|---|---|---|---|---|
| 2026-09-24 | 59 MB | 716,354 | 599,982 | 105,343 |
| 2026-09-27 | 13 MB | 165,190 | 142,979 | 19,216 |
| 2026-09-28 (to 13:00, after a restart) | 1 MB | 12,796 | 11,013 | 1,295 |

Up to 25k admission lines an hour came from two LAN browsers (192.168.0.101 and .215) that
poll the Management App and the Dashboard every 3–5 s across a dozen endpoints — and a
dashboard tab left open overnight keeps doing that at ~0.8 requests/s, because eight of the
client's pollers did not check `document.hidden`.

**Every one of those lines took three trips.** `Logger.Log` wrote it under the one global
lock with `AutoFlush = true` (a syscall per line); `Logger.OnLog` raised into `MainForm`, which
did a `BeginInvoke` per line onto the UI thread; the UI thread then ran `AppendText` +
`SelectionStart = TextLength` + `ScrollToCaret()` on a `RichTextBox` that was **never
trimmed**. A day's 59 MB of text sat in that control; each append re-laid-out a bigger
document, and the UI thread spent a growing share of every second on it. That is the
"130–140 %": a full core of UI-thread log painting on top of the request work.

**It crashes the process.** Windows' Application log (Event IDs 1000/1026) shows the hub's
`ClaudeWeb.exe` dying with `System.AccessViolationException … at
System.Windows.Forms.NativeWindow.DefWndProc ← Control.WndProc` on **2026-09-17 04:19** and
**2026-09-22 11:31**. The lab reproduced exactly that stack on the unmodified build after
160k pumped lines (Application log 2026-09-28 13:00, the `before-long` run below): the
RichTextBox's native control faults inside `ScrollToCaret` once the document is large
enough. The "degrades over time" report is this: the box grows all day, the UI thread gets
slower all day, and some days the control faults and the hub is simply gone.

**What was not the problem.** The API is cheap. In the lab the dashboards' full polling mix
(13 endpoints, ~2.6 req/s) costs 9 % of one core on the unmodified build, no endpoint takes
more than ~50 ms even with the collector feed at its 1000-event cap, and the pages themselves
load in ~100–200 ms once the browser is warm. `git status` spawns (~4 processes/s on the hub,
105k `[GIT]` lines on the 24th) are real load but land in `git.exe`, not in this process.

## 2. The fixes, in the order of their weight

### 2a. Log path (the CPU, the growth, the crash)

| Piece | Before | After |
|---|---|---|
| `Logger` file writer | `AutoFlush = true` — one flushed write per line under `_gate` | buffered; a `System.Threading.Timer` flushes every 750 ms; `Error()` flushes at once; `Close()` flushes before dispose |
| `MainForm` ↔ `Logger` | `OnLog += AppendLog` → `BeginInvoke` + `AppendText` + `ScrollToCaret` **per line** | `OnLog += QueueLog` → `ConcurrentQueue`; a 250 ms `Forms.Timer` drains ≤ 2000 lines into **one** `AppendText`, one `ScrollToCaret` |
| Activity box size | unbounded (the day's log) | past 600k chars the oldest lines are cut to 400k, at a line boundary |
| Queue to the UI thread | unbounded pending `BeginInvoke`s | `LogQueueMax = 5000`; past it the oldest queued line is dropped |
| Status-bar counters | `BeginInvoke` per log line | coalesced: the timer paints the latest values once per tick |
| `[IPFILTER] Admitted` | one line per admitted LAN request | one line per address per 5 minutes, with the count since the previous line |

### 2b. Work that scaled with history or uptime

| Piece | Before | After |
|---|---|---|
| `AutopilotAuditLog.EnsureLoaded` | deserialized the whole `autopilot-audit.jsonl` (177k entries, 55 MB) into a `List<Entry>` kept for the life of the process | reads the file as lines, keeps the **last 20,000** in a queue, deserializes only those; `Append` trims at 22k. The file is untouched; every reader asks for a recent slice anyway |
| `ActivityLog.Read` (Scoreboard, every 5 s) | `File.ReadAllLines` + parse every call | parsed once per change: cached with the file's `(Length, LastWriteTimeUtc)` |
| `CollectorEvent` / `ArchAgentService.LocalAgents` | fleet status called `LatestTurnStart(events, repoId)` per repo, and each call `JsonSerializer.SerializeToElement(ev.Source)` for **every** event to read its `repoId` — 1000 events × ~20 repos per poll | `CollectorEvent.RepoId` is read once at `Append`; `LocalAgents` groups this machine's events by repo in one `ToLookup` and hands each repo its own list. `ArchClaims` and `LatestTurnStart` use `ev.RepoId ?? RepoIdOf(ev.Source)` |
| `SessionService.GetActivity` (Dashboard, every 5 s, per dock) | `GetMessages` copied each dock's whole message list, then `LastOrDefault` twice | the digest is computed under the message cache's lock, scanning from the end; handoff-prior messages fold in without a copy |
| `GET /api/taskgraph/policeman` (every 5 s) | every in-flight card's transcript tail — 1.48 MB per response | the tail rides only for `?card=` (the drawer); default `take` 200 → 60. 474 KB |
| Client pollers | `SystemTestsView`, `AutopilotConsole`, `AutopilotPanel`, `FlagsHistoryView`, `TestInventoryView`, `Deployments`, `FlagsContext`, `StaleVersionBanner` polled while hidden | each interval skips its tick while `document.hidden` (the existing `visibilitychange` refreshes catch up on return) |

## 3. Before / after

### 3a. The dashboards' polling mix (`perf-measure.mjs`, 40 s, 13 endpoints, ~2.6 req/s)

| | before (`82d92beb`) | after (this branch) |
|---|---|---|
| Process CPU, feed empty | 9 % of one core, 35 ms CPU / request | **6 %**, **23 ms** / request |
| Process CPU, feed at cap (900 events) | 9 %, 35 ms / request | **6 %**, **24 ms** / request |
| RSS at boot → after the mix → end | 147 → 406 → 414 MB | 150 → **258** → **279 MB** |
| `/api/taskgraph/policeman` | 1,480,538 bytes, 11 ms | **473,502 bytes**, 6 ms |
| `/api/analytics` | 23 ms (14 ms feed-full) | 17 ms (**8 ms**) |
| `/api/arch/fleet/status` | 49 ms | 46 ms (see note) |

Note on fleet status: in the lab it is dominated by the per-repo `git` calls it makes, not by
the event scan, so the serialization fix shows up as CPU per request rather than latency.

### 3b. Page loads (`perf-pageload.mjs`, 5× each, headless Chromium, median)

| Page | before | after |
|---|---|---|
| Management App › Status | 190 ms | 189 ms |
| Management App › Kanban | 210 ms | 204 ms |
| Management App › Arch | 99 ms | 102 ms |
| Dashboard (`/studio`) | 173 ms | 195 ms |

The pages were never slow on a fresh process (the first load of a run is ~5 s on both builds
— that is Chromium and the bundle warming up, identical before and after). The slowness the
Operator saw is the *host* being slow: the same requests queued behind a UI thread and a
logger lock busy with the day's log. That is what §3c measures.

### 3c. The log path under load (`perf-logpump.mjs`, concurrency 16, sampled every 20k lines)

Each request writes one log line. Before: the LAN admission line itself. After: admissions
are rate-limited, so the same run on the fixed build writes almost nothing (row "after,
admissions") — and a second run drives a line that is still logged per request on both builds
(`GET /api/files/read`, `[FILE] Read …`) to compare the log path itself (rows "file line").

| Run | lines | CPU ms / 1k req | RSS | fleet-status probe | outcome |
|---|---|---|---|---|---|
| before, admissions | 20k → 120k | 516 → 347 | 126 → 208 MB | 42 → 39 ms | growing |
| before, admissions (long) | 20k → 160k | 455 → 450 | 126 → 298 MB | 41 → 43 ms | **crashed at 160k** — `AccessViolationException` in `RichTextBox.WndProc` ← `ScrollToCaret` (Application log 13:00) |
| after, admissions | 20k → **400k** | 251 → **112–150** | 129 → **148–152 MB, flat** | 42 → 36–43 ms | one `Admitted` line in the log; box and RSS bounded |
| after, file line | 20k → **400k** | 630 → **420–470** | 130 → **171–182 MB, flat** | 40 → 36–47 ms | 400k lines through logger + box; bounded |
| before, file line | 20k → 320k | 952 → 630–850 | 126 → **918 MB and climbing** (187 @20k, 395 @100k, 595 @200k, 918 @320k) | 41 → 39–64 ms | the driver stopped at 320k; the process was at 932 MB when it was killed |

The two "file line" rows are the like-for-like comparison of the log path: the same request,
the same one log line per request, on both builds. The unmodified build pays ~300 ms more CPU
per 1,000 lines and ~2.5 MB of resident memory per 1,000 lines, and never gives it back; the
fixed build pays the file read and stays where it booted. (The file-read driver's own cost is
in both rows: reading README.md and JSON-encoding 8.7k characters ≈ 300 ms per 1k.)

## 4. Deferred (found, measured or seen, not changed here)

- **`git` spawns** — `git status` per dock per fleet-status / dock poll: ~4 processes/s on
  the hub, 105k `[GIT]` lines on the 24th. Separate processes, so not this process's CPU,
  but the largest remaining load on the box. A per-repo status cache with a short TTL
  shared by every reader is the fix; it touches `GitService` callers across the dock, arch
  and status paths, so it is its own change.
- **Policeman journal** — `TaskGraphVerifier` rewrites its ~2.5 MB journal file per pass.
- **`TrafficStats`** — a lock per request around a dictionary update; contention shows on
  `dotnet-stack` under the pump but not at the hub's request rate.
- **Transcript accumulators** grow per session without a cap; the message cache holds 24
  files against a 64-dock roster; `SessionService._summaries` and `PolicemanSweep._said`
  are unbounded dictionaries. None of them moved the RSS in the 40-minute lab runs, but
  each is a slope over days.
- **Hub memory** on the live process was 435 MB at 10 minutes of uptime and 520–535 MB at
  30 minutes today, with the unmodified build — the audit log's 55 MB and the growing
  activity box account for most of the difference to the lab's 150 MB boot figure.

## 5. Why these shapes

- A **timer-drained queue** rather than a smarter `BeginInvoke`: the UI thread must touch
  the RichTextBox, so the only lever is *how many times*. Four batches a second is invisible
  to a human and turns 25k marshals an hour into 14k a day regardless of load.
- **Trimming by cutting `Text`** rather than `Select`+`SelectedText = ""`: the cut happens at
  most once per 200k characters of new log, and a plain assignment is the operation
  guaranteed not to leave the control in the selection-scrolled state that faulted.
- **Rate-limiting the admission line** rather than deleting it: the line is how an operator
  sees *who* is on the LAN; once per address per five minutes with a count keeps that.
- **A buffered logger with a 750 ms flush** rather than `AutoFlush`: errors still flush at
  once, shutdown flushes, and a crash loses under a second of ordinary lines — the
  Application log records the crash itself.
- **Keeping 20k audit entries in memory** rather than paging: every reader takes a recent
  slice (`Tail`, `Recent`, per-loop filters over the newest passes); the file remains the
  durable record and the whole history is one `EnsureLoaded` line-scan away.
