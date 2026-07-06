# Tasks: add-claude-usage

## 1. Backend — usage probe

- [x] 1.1 Create `ClaudeWeb.App/Services/Accounts/ClaudeUsageService.cs`:
      read `claudeAiOauth.accessToken` from `~/.claude/.credentials.json`
      into a local (never a field/log/error string), call
      `GET https://api.anthropic.com/api/oauth/usage` with
      `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`
      (both as constants), tolerant-parse `limits[]` (kinds `session`,
      `weekly_all`, `weekly_scoped` → session/weekly/scopedWeekly) with
      `five_hour`/`seven_day` as fallback; fail-soft on every path
      (missing token, non-2xx, unparseable body → `available:false` +
      short reason; log status codes / exception types only)
- [x] 1.2 Add caching to the service: 5-minute TTL, single-flight refresh
      (concurrent callers await one upstream call), serve last good result
      with `stale:true` when a refresh fails after a prior success
- [x] 1.3 Register the service and add `GET /api/claude-usage` in
      `EmbeddedApi.cs` next to `/api/claude-account` (same auth gate),
      returning the camelCase contract
      `{ available, stale, fetchedAt, session, weekly, scopedWeekly, error }`
      with HTTP `200` in every case
- [x] 1.4 Verify by hand on this machine: authenticated → real percentages
      match `claude /usage`; then rename `.credentials.json` temporarily →
      `available:false`, no exception, no token fragment in logs; restore

## 2. Frontend — usage in the Claude chip

- [x] 2.1 Extend the Claude chip in
      `client/src/components/dashboard/AccountChips.jsx` to fetch
      `/api/claude-usage` on the same poll cadence as the account probe and
      render, in the expanded state below plan: meter rows for 5-hour window,
      weekly quota, and each scoped weekly entry (label from the API, e.g.
      the model name) — percent bar, percent text, reset time; collapsed
      state untouched
- [x] 2.2 Style in `accountChips.css`: compact meter row (fits the chip
      without adding a second visual block), muted "usage unavailable" line,
      and a distinguished style when `severity !== 'normal'` (reuse the
      chip's existing warn/err palette)
- [x] 2.3 Add i18n keys (`en.json`, `tr.json`): usage row labels ("5h",
      "Week"), "resets {time}", "usage unavailable", stale hint
- [x] 2.4 Degradation behavior: `available:false` or fetch error renders the
      unavailable line only — identity rows (account/plan) must render
      exactly as before; `stale:true` shows the stale hint without changing
      the numbers' layout

## 3. Verification & docs

- [x] 3.1 Headless browser check (docs/claude-web/browser-testing.md):
      dashboard shows the usage rows in the expanded Claude chip; collapse →
      no usage content; identity intact when the usage endpoint is forced to
      fail (point the service at a dead port via a test override or block
      the upstream)
- [x] 3.2 Grep gate: no token value can reach logs or responses — audit that
      `accessToken` is only referenced inside the probe method and never
      interpolated into strings
- [x] 3.3 `openspec validate add-claude-usage --strict` passes; update
      `plans/`-adjacent docs only if any state the old "harness never reads
      the token" claim (search and correct to the new boundary)
