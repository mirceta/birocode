## Context

The Scoreboard reads `%APPDATA%\ClaudeWeb\activity.jsonl` (append-only, never
trimmed) via `ActivityLog.Read()`, and `AnalyticsService.Compute(window)` folds it
into metrics scoped to a `today | 7d | all` window. The scalars, the
concurrency-over-time series, and the per-agent leaderboard all honor that window.

The one exception is the **per-day activity strip**. `AnalyticsService.Daily()`
ignores the window entirely and always emits exactly 7 `DayStat` entries
(`for (i = 6; i >= 0; i--)`, oldest → newest). Its own comment says it is
"independent of the selected window so the trend strip is stable." The frontend
`ActivityStrip` (`Scoreboard.jsx`) consumes `data.daily` and is sized for that
fixed week. So picking "All" widens every number except the trend, which still
shows only the last 7 days — the gap this change closes.

## Goals / Non-Goals

**Goals:**
- The activity strip's day span tracks the selected window: `today` → 1 day,
  `7d` → 7 days (unchanged), `all` → first recorded run's calendar day through
  today (inclusive).
- `daily[]` becomes variable-length; the frontend renders N bars, not a hardcoded 7.
- No change to the `Analytics` record's *shape* (fields stay the same) — only the
  length/contents of `daily[]` change, so the endpoint contract is preserved.

**Non-Goals:**
- Density management for long histories (week/month bucketing, horizontal scroll,
  zoom). Deferred — today the ledger is ~10 days old. Noted as a follow-up.
- Backfill of pre-ledger history (already deferred in `plans/scoreboard-analytics.md`).
- Changing the default window (stays `7d` in the UI).

## Decisions

### 1. `Daily()` takes the window's lower bound and computes a day count

Replace the fixed `for (i = 6; i >= 0; i--)` with a span derived from the window:

- Determine the strip's **first day** = local midnight of:
  - `today` → today,
  - `7d` → 6 days ago,
  - `all` → the calendar day of the earliest `start`/run in the ledger (fallback to
    today when the ledger is empty).
- Iterate from that first day's midnight up to tomorrow's midnight, one `DayStat`
  per calendar day, reusing the existing per-day prompt-count + clipped-work logic.

`Compute()` already knows `win` and computes `LocalMidnight(...)`; thread the window
(or the resolved first-day midnight) into `Daily()`. Earliest run day comes from
`allRuns`/`events` already loaded — no extra read.

**Why not always span full history regardless of window?** That would desync the
strip from the scalars (e.g. "Today" showing a year of bars). Tracking the window
keeps the whole panel telling one consistent story, which is the v2 design intent.

**Why local-calendar days (not UTC)?** The rest of the service already defines days
via `LocalMidnight` (host local midnight = "today"). Reuse it for consistency.

### 2. Frontend renders a variable number of bars

`ActivityStrip` currently maps over `daily` (it does not hardcode 7 in the map), so
the main change is layout: a wider/wrapping strip and a label reflecting the real
span ("activity · all" vs a fixed "last 7 days"). Add CSS to let the strip wrap or
scroll horizontally if the bar count grows; keep bar min-width readable.

### 3. Endpoint stays `GET /api/analytics?window=` — no new params

The window already selects the scope; `daily[]` simply follows it. No controller
signature change, no new query params.

## Risks / Trade-offs

- **[Unbounded strip width as history grows]** → For now (~10 days) it's fine; CSS
  wrap/scroll caps the visual blast radius. Real bucketing is an explicit follow-up,
  logged in the proposal's out-of-scope note and `plans/scoreboard-analytics.md`.
- **[Empty ledger / no runs on "all"]** → Earliest-day lookup must fall back to
  today so the strip shows a single empty day, never an empty or inverted range.
- **[A consumer assuming `daily.length === 7`]** → Only `Scoreboard.jsx` reads it;
  audited as the sole consumer. The verify step asserts variable length.
- **[Strip stability]** → The old comment valued a "stable" 7-day strip; window-
  scoping trades that for consistency with the rest of the panel — an intentional
  reversal, recorded in the spec and plan.

## Migration Plan

Pure additive behavior change to an in-app analytics view; no data migration (the
ledger is unchanged). Deploy via the standard `swap.ps1` cycle after browser-verify
on an isolated preview port. Rollback is the normal dead-man's-switch / `swap.ps1`
revert — no special steps.

## Open Questions

- None blocking. The long-history density UX is deliberately deferred, not unresolved.
