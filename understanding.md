# Understanding — Scoreboard v2 (redesign)

**Goal:** the scoreboard's numbers are correct but answer the wrong question.
Redesign it so it gives *actionable, time-aware* usage analytics instead of
flat all-time scalars. My call (you said "do it my way").

## What's wrong with v1 (why we're redoing it)

1. **Work-vs-idle is meaningless** — idle = `(lastFinish − firstStart) − work`
   over the agent's *all-time* span, so any agent used morning + evening reads
   ~99% idle. No information. **Dropping it.**
2. **Mixed timeframes** — `promptsToday` is today; everything else is all-time.
   No number is comparable to another.
3. **No graph over time** — peak concurrency is a scalar; the charts are
   per-agent bars. You asked for graphs; the interesting shapes (concurrency
   across the day, prompts per day) aren't drawn.
4. **Fragile pairing** — runs paired per repo folder assuming one-at-a-time; a
   crashed run (no `finish`) leaks; cost is on the call record but unused.

## What I'll build

**Backend** (`AnalyticsService` + `ActivityLog` + controller):
- `GET /api/analytics?window=today|7d|all` — every scalar scoped to one window.
- **Concurrency-over-time series** (step points) for the hero chart.
- **Daily buckets** (last 7 days: prompts + work) for a trend strip.
- **Per-agent leaderboard**: runs · total work · longest · last used (no idle).
- Scalars: prompts, peak concurrency, longest run, total work, **total cost**
  (cost captured into the `finish` event going forward — historical = 0).
- Firmer pairing: ignore/expire orphan starts; tolerate missing finishes.

**Frontend** (`Scoreboard.jsx`):
- Timeframe toggle (Today / 7 days / All) in the panel header.
- Stat cards (window-scoped; cost card when > 0).
- **Concurrency over time** — step-area chart (replaces work/idle).
- **Activity, last 7 days** — prompts-per-day bars.
- **Agents leaderboard** — clean ranked table (replaces per-agent bars).
- Keeps the collapsible panel.

## Still deferred
- **Transcript backfill** (history before the ledger) — its own feature.
- **Token counts** — only cost is on the call record today; tokens would need
  transcript parsing.

Assumptions: timeframe toggle is component state (not persisted); "today"/day
buckets use local host midnight (unchanged).
