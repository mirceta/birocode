## Why

The Scoreboard's `activity.jsonl` ledger retains every run event forever, and the
Today / 7d / **All** window toggle already scopes the headline scalars and the
concurrency series to the chosen timeframe. But the per-day **activity strip** is
hardcoded to the trailing 7 calendar days (`Daily()` loops `i = 6 → 0`) regardless
of the selected window — so even on "All" the trend only shows a week, silently
hiding the rest of the retained history. The panel claims to show "all" but doesn't.

## What Changes

- **Daily activity strip follows the selected window** instead of a fixed 7 days:
  - `today` → just today,
  - `7d` → the trailing 7 calendar days (unchanged),
  - `all` → every calendar day from the first recorded run through today.
- `GET /api/analytics?window=all` returns a `daily[]` that spans the full history
  rather than always 7 entries; the array length becomes variable.
- The frontend `ActivityStrip` renders a variable number of day bars (no longer
  assumes 7) and labels the strip with the actual span.
- Update `plans/scoreboard-analytics.md` to record that the strip is now
  window-scoped (the v2 note that called it "always last 7 days" is superseded).

Not in scope: long-history density handling (bucketing into weeks/months, or
horizontal scroll) once the history grows large — noted as a follow-up, not built
now (history is ~10 days old today).

## Capabilities

### New Capabilities
- `scoreboard-analytics`: the dashboard Scoreboard panel — its window-scoped
  metrics (longest run, peak concurrency, prompts, total work, cost), the
  concurrency-over-time series, the per-agent leaderboard, and the per-day
  activity strip, all folded from the `activity.jsonl` run ledger and served by
  `GET /api/analytics?window=`. Seeded here (seed-and-grow), with the new
  requirement that the activity strip's span tracks the selected window.

### Modified Capabilities
<!-- None — no existing spec covers the Scoreboard; it is seeded as a new capability above. -->

## Impact

- **Backend:** `ClaudeWeb.App/Services/Analytics/AnalyticsService.cs` — `Daily()`
  becomes window-aware (variable day count, first-run day → today for "all");
  `Compute()` passes the window through to it. `AnalyticsController.cs` shape is
  unchanged structurally (`daily[]` is just variable-length now).
- **Frontend:** `client/src/components/dashboard/Scoreboard.jsx` — `ActivityStrip`
  must not assume 7 bars; minor label/layout tweak for a variable, possibly wider
  strip; `client/src/components/dashboard/scoreboard.css` if the strip needs to
  wrap or scroll.
- **API consumers:** any caller assuming `daily.length === 7` — only the
  Scoreboard component consumes it.
- **Docs:** `plans/scoreboard-analytics.md`.
