# Design: add-dashboard-host-clock

## Context

The dashboard's Scoreboard row (`dash__scoreboard-row` in
`client/src/pages/Dashboard.jsx`) already hosts two kinds of host-global,
read-only probes rendered as compact panels: the Scoreboard
(`GET /api/analytics`) and the account chips (`GET /api/github-account`,
`GET /api/claude-account` in `ClaudeWeb.App/Controllers/AccountsController.cs`).
All poll on a shared 5 s cadence and keep the last good snapshot on a failed
tick. The End User views this from a phone whose own clock/timezone may differ
from the host box that actually runs agents, loops, and the deploy rollback
timer. This change adds a third citizen to that row: a live host clock.

## Goals / Non-Goals

**Goals:**
- Show the host machine's **Windows wall-clock time** (value + timezone) on the
  Scoreboard row, correct regardless of the phone's timezone.
- Keep it live while the dashboard is open, without hammering the API.
- Make a stale reading visible instead of silently wrong.

**Non-Goals:**
- No clock configuration (timezone override, formats, NTP checks).
- No times for other machines (the task-graph Machine records are untouched).
- No change to Scoreboard or account-chip behavior; purely additive.
- No server push/SSE — polling like its row siblings is enough.

## Decisions

1. **New read-only endpoint `GET /api/host-time`, own small controller.**
   Returns `{ unixMs, iso, timeZoneId, utcOffsetMinutes }` computed from
   `DateTimeOffset.Now` / `TimeZoneInfo.Local` — the Windows clock of the
   harness process, per the proposal's "directly from Windows". A clock is not
   an account, so it does not join `AccountsController`; it follows the same
   probe idiom (always 200, typed fields, `Logger.CountRequest()`) in a new
   `HostTimeController` per `plans/INTEGRATION.md`. No service/DI needed — the
   read is trivial and needs no memoisation.

2. **Client renders host wall time by applying the server's offset, never the
   phone's locale timezone.** Display time = `unixMs + utcOffsetMinutes·60000`
   formatted **as UTC**. Formatting `unixMs` with the phone's default formatter
   would show the phone's timezone — exactly the bug this feature exists to
   avoid. The chip also shows the offset (e.g. `UTC+2`) so the reading is
   unambiguous.

3. **Tick locally at 1 s from a synced offset; resync every 5 s.** On each
   successful poll the client stores `skewMs = serverUnixMs - Date.now()`; the
   1 s ticker renders `Date.now() + skewMs` shifted by the host offset. This
   gives a smooth `HH:mm:ss` clock without 1 s polling, stays accurate through
   missed polls, and the 5 s resync (same `POLL_MS` as the row's siblings)
   picks up DST/offset changes and bounds phone-clock drift.

4. **Staleness is shown, not hidden.** On a failed poll the clock keeps
   ticking from the last good sync (the skew model stays valid), but after
   ~3 consecutive failures (>15 s) the chip gains a visible stale marker
   (dimmed + tooltip), mirroring the "keep last good snapshot" policy of the
   row's siblings while adding the honesty signal a *clock* needs.

5. **Advanced-only via the capability map.** New `hostClock` entry in
   `client/src/context/UiModeContext.jsx` set to `'advanced'`, per the repo
   convention that new UI features default to Advanced. Render-gated in
   `Dashboard.jsx` beside the `accountChips` gate.

## Risks / Trade-offs

- [Phone clock jumps (manual change, suspend/resume) make the skewed tick wrong
  until the next resync] → resync cadence is 5 s, and `visibilitychange` on the
  dashboard already refetches sibling data; worst case ≤5 s of wrong seconds.
- [DST transition between polls shows the old offset briefly] → offset is
  recomputed server-side on every poll; ≤5 s exposure.
- [`TimeZoneInfo.Local` display strings are localized/verbose on Windows] →
  show the stable `UTC±HH:mm` offset in the chip; the id/display name goes in
  the tooltip only.

## Migration Plan

Additive feature — normal build + deploy via `swap.ps1`; no data, config, or
API migrations. Rollback = the standard dead-man auto-rollback.

## Open Questions

- None blocking. (Whether Basic mode should also see the clock is deferred —
  default-Advanced per convention until the user says otherwise.)
