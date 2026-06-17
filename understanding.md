# Understanding — Basic mode never shows the dashboard

## Goal (bug fix)
In Basic (Simple) UI mode the app must always be the plain **tabbed view** — the
agent-dashboard overlay should never appear.

## Root cause
`agentDashboard` is `'advanced'`-gated, but that gate only blocks *opening* the dashboard.
The overlay renders from `dashOpen` local state in `StudioShell` (`client/src/layout/Layout.jsx`).
Open it in Advanced (`dashOpen = true`), switch to Basic → `dashEnabled` goes false but
`dashOpen` stays true, so the overlay keeps showing.

## Fix (to build next)
In `Layout.jsx` `StudioShell`:
1. Gate the overlay render on `dashEnabled && dashOpen` (so Basic always falls through to
   the tabbed `Outlet`).
2. Add an effect that sets `dashOpen=false` when `dashEnabled` becomes false.

Frontend only; no backend, no new i18n.

## Kickoff status
Branch `feature/basic-mode-no-dashboard` created off main (synced with origin). Plan entry
added to Active feature plans → [plans/basic-mode-no-dashboard.md](plans/basic-mode-no-dashboard.md).
Not implemented yet.
