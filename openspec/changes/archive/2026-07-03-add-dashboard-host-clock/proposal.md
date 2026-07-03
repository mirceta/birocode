# Proposal: add-dashboard-host-clock

## Why

The dashboard already answers "who is working?" (Scoreboard) and "who am I logged
in as?" (the GitHub/Claude account chips beside it), but not "what time is it **on
the host box**". The End User is on a phone — often away from the machine and
possibly in another timezone — while everything that matters runs on the host's
Windows clock: agent runs, the activity ledger the Scoreboard folds, autopilot
loops, and the deploy dead-man's-switch (a 15-minute scheduled-task rollback).
Today there is no way to see that clock from the web UI; the phone's own clock can
silently disagree with it.

## What Changes

- New read-only backend probe that reports the **host computer's local time, read
  directly from Windows** (the harness process's `DateTime.Now` /
  `TimeZoneInfo.Local` — not the browser clock, not UTC math done client-side),
  including the timezone so the reading is unambiguous.
- New compact **host clock** display on the dashboard's Scoreboard row
  (`dash__scoreboard-row`), sitting alongside the Scoreboard and the account
  chips, matching their visual idiom.
- The clock stays current while the dashboard is open (server-synced, ticking
  between syncs) and makes it visible when the reading is stale (e.g. harness
  unreachable) rather than showing a silently frozen or browser-derived time.
- Registered in the UI-mode capability map as `advanced` per the repo convention
  (new UI features default to Advanced).

## Capabilities

### New Capabilities

- `dashboard-host-clock`: surfacing the host machine's Windows local time (value +
  timezone) via a harness API and displaying it live on the dashboard's
  Scoreboard row.

### Modified Capabilities

<!-- none — the Scoreboard and account chips are untouched; the clock is additive
     on the same row. `scoreboard-analytics` requirements do not change. -->

## Impact

- **Backend** (`ClaudeWeb.App/`): one new read-only GET endpoint (host time +
  timezone), wired per `plans/INTEGRATION.md` module conventions. No persistence,
  no auth changes (sits behind the existing session gate like the other probes).
- **Frontend** (`client/`): new dashboard component + CSS beside
  `Scoreboard.jsx` / `AccountChips.jsx` in `client/src/components/dashboard/`;
  one render-site change in `client/src/pages/Dashboard.jsx`
  (`dash__scoreboard-row`); i18n keys in `en.json` / `tr.json`; capability map
  entry in `client/src/context/UiModeContext.jsx`.
- **No breaking changes**; purely additive.
