# Scoreboard / analytics

> **Status (2026-06-15):** Plan — design decided, not built. On
> `feature/scoreboard-analytics`. Decisions locked: **new `activity.jsonl`
> events ledger**; UI = a **panel on the dashboard, above the agent docks**;
> **hand-rolled SVG** charts (no lib); "today" = **local midnight on the host**;
> **backfill deferred** to a future feature. Structured per
> [doc-principles.md](doc-principles.md).

## Problem / goal

A **scoreboard** that quantifies how the agents are being used — at a glance and
over time. Metrics:

| Metric | Meaning |
|--------|---------|
| Longest-running agent | the single longest run (and/or largest total run time) |
| Peak concurrency | the most agents running **at the same time** |
| Prompts today | count of prompts sent since local midnight |
| Per-agent window | first → last use, with **work time** vs **idle time** |
| Total work time | all agents' work time summed |
| Graphs | a timeline of activity + charts for the above |

## Data source — the load-bearing decision

Every metric is a function of a **time series of run events** (per agent run:
when it started, when it finished, which repo). What exists today:

- **`CallLog`** (`Services/Monitoring/CallLog.cs`) — each run is a `CallRecord`
  with `StartedAt` / `FirstTokenAt` / `FinishedAt`, status, sessionId, repo. But
  it's **in-memory, capped at 200, lost on restart** — no history, no "today".
- **Session transcripts** on disk — per-message timestamps; durable but
  scattered and expensive to scan; "work vs idle" must be inferred.

```mermaid
flowchart TD
    RUN["each agent run<br/>start / finish"] --> LEDGER[("activity.jsonl<br/>append-only events")]
    LEDGER --> AGG["analytics service<br/>aggregates the metrics"]
    AGG --> API[("/api/analytics")]
    API --> UI["Scoreboard UI<br/>(stats + graphs)"]
    style LEDGER fill:#eef7ee,stroke:#4f9d69
```

**Decision: a new append-only events ledger** — `activity.jsonl` in
`%APPDATA%\ClaudeWeb\`, one line per run lifecycle event (`{ ts, event:
start|finish, repoId, sessionId }`), written where `CliRunnerService` already
calls `CallLog.StartCall` / finalizes. Same atomic-append discipline as
`deploys.jsonl`. An analytics service folds the ledger into the metrics; a
`GET /api/analytics` endpoint serves them. Accurate (real concurrency +
durations), durable, cheap to read. (Mining transcripts was the rejected
alternative: slower and fuzzier.)

## Defining work vs idle (locked)

An agent = a repo's runs. A **run** is one prompt→answer (CLI process
`StartedAt`→`FinishedAt`).

- **Work time** = sum of a run's `FinishedAt − StartedAt` (the CLI was actually
  running). All-agents total work time = sum across every run.
- **An agent's used window** = its first run start → its last run finish.
- **Idle time** = `window − work time` (time the agent existed but wasn't running
  — the gaps between bursts, waiting for the user).
- **Peak concurrency** = the most run-intervals overlapping at any instant.
- **Longest-running agent** = the agent with the largest single run (and we'll
  also show largest total work time).
- **Prompts today** = `start` events since **local midnight on the host**.

## Design

- **Backend:** `ActivityLog` service (append + read `activity.jsonl`); hook its
  append into `CliRunnerService` at run start/finish (right next to the existing
  `CallLog` calls). An `AnalyticsService` folds the ledger into the metrics
  (longest run, peak concurrency, prompts-today, per-agent work/idle, total work
  time). `AnalyticsController` → `GET /api/analytics`. DI via a
  `AddAnalyticsModule()` extension (the per-module convention).
- **Frontend — a panel on the dashboard, ABOVE the agent docks.** In
  `pages/Dashboard.jsx`, render a `Scoreboard` component between the header and
  the agent grid (full-width strip): the headline numbers + graphs, with the
  agent docks below as today. Polls `/api/analytics` while the overlay is open
  (the dashboard's existing poll cadence). Advanced-mode gated (rides the
  dashboard's gating).
- **Charts — hand-rolled SVG** (no lib bundled, the easier/lighter option): a
  horizontal **timeline** of run intervals (rows per agent, overlap shows
  concurrency) + a couple of simple **bar** rows (work time per agent, prompts).

```mermaid
flowchart TD
    H["dashboard header"] --> SB["Scoreboard panel<br/>stats + SVG graphs"]
    SB --> GRID["agent docks (grid)"]
    style SB fill:#eef7ee,stroke:#4f9d69
```

## Resolved

1. **Data source:** new `activity.jsonl` events ledger.
2. **Work/idle:** defined above (run = CLI start→finish; idle = window − work).
3. **"Today":** local midnight on the host.
4. **UI home:** a panel on the **dashboard, above the agent docks** (not a tab).
5. **Charts:** hand-rolled SVG (no lib).

## Deferred (future feature)

- **Backfill.** Analytics start empty the moment the ledger ships — no history
  before then. Reconstructing past activity from existing **session transcripts**
  is its own future feature; noted here, out of scope for this slice.

## Verification (later)

Seed a known `activity.jsonl` (overlapping intervals, some today/some earlier);
assert the API returns the expected longest run, peak concurrency, prompts-today,
per-agent work/idle, and total work time; then browser-verify the Scoreboard
renders them + graphs on an isolated preview.
