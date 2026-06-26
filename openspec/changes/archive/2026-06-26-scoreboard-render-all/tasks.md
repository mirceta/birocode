## 1. Backend — window-scoped daily series

- [x] 1.1 In `AnalyticsService.Daily()`, replace the fixed `for (i = 6; i >= 0; i--)` loop with a window-driven span: compute the strip's first-day midnight (`today` → today, `7d` → 6 days ago, `all` → earliest run's calendar day, falling back to today on an empty ledger), then emit one `DayStat` per calendar day from that midnight through today (oldest → newest), reusing the existing per-day prompt-count + clipped-work logic.
- [x] 1.2 Thread the selected window (or the resolved first-day midnight + earliest-run day) from `Compute()` into `Daily()`; derive the earliest run day from the already-loaded `allRuns`/`events` (no extra ledger read).
- [x] 1.3 Confirm the `Analytics` record shape is unchanged (only `daily[]` length/contents vary) so `AnalyticsController` / `GET /api/analytics?window=` needs no signature change.

## 2. Frontend — render the full span

- [x] 2.1 In `Scoreboard.jsx` `ActivityStrip`, render one bar per `daily[]` entry without assuming 7; recompute `maxP` over the actual entries.
- [x] 2.2 Label the strip with the span actually shown (reflecting the selected window) instead of a fixed "last 7 days".
- [x] 2.3 In `scoreboard.css`, let the strip stay readable as the bar count grows (wrap or horizontal scroll, sensible bar min-width); update any i18n strings touched by the relabel.

## 3. Docs

- [x] 3.1 Update `plans/scoreboard-analytics.md`: record that the activity strip is now window-scoped (supersede the v2 note that it is "always the last 7 days"); add the long-history density handling (bucketing/scroll) as an explicit deferred follow-up.

## 4. Verify

- [x] 4.1 Seed a known `activity.jsonl` with runs spanning more than 7 calendar days on an isolated build; assert `GET /api/analytics?window=all` returns `daily[]` spanning earliest-run-day → today (>7 entries), `window=7d` returns exactly 7, `window=today` returns 1, and an empty ledger on `all` returns a single current-day entry.
- [x] 4.2 Browser-verify on an isolated preview port (Playwright): switching the window toggle to `all` renders more than 7 day bars and the strip label updates; screenshot. (Test isolation per the dock/preview gotchas — own dock tab, restore shared state.)
- [x] 4.3 Run `openspec validate scoreboard-render-all --strict` and the frontend build (`npm --prefix client run build`); confirm both pass.
