# Basic mode never shows the dashboard

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-17): SHIPPED.** Deployed to live :5099 & confirmed; **merged to main
> 2026-06-17**. On `feature/basic-mode-no-dashboard`.

## The bug

Basic (Simple) mode must always be the plain tabbed view — never the agent-dashboard
overlay. Today it can still appear: the dashboard's availability
(`agentDashboard: 'advanced'` in `UiModeContext`) only gates *opening* it, but whether the
overlay is shown is driven by `dashOpen` local state in `StudioShell` (`Layout.jsx`).

Repro: open the dashboard in Advanced mode (`dashOpen = true`), then flip the Mode toggle
to Basic. `dashEnabled` goes false, but `dashOpen` stays true, so the overlay keeps
rendering (`Layout.jsx:136`, the `{dashOpen ? <Dashboard/> : …}` branch). The entry button
and the Ctrl/Cmd+Shift+D shortcut are correctly gated; only the persisted-open state isn't.

## Fix

Make "show the dashboard" require BOTH the feature and the open state, so Basic mode can
never render it regardless of leftover state:

1. **Render guard** — gate the overlay branch on `dashEnabled && dashOpen` (defensive: even
   if `dashOpen` is stale, Basic mode falls through to the normal tabbed `Outlet`).
2. **Reset on mode change** — an effect that forces `setDashOpen(false)` when `dashEnabled`
   becomes false, so closing isn't just visual (keyboard/Escape state stays consistent).

Both live in `client/src/layout/Layout.jsx` (`StudioShell`). No backend, no new i18n.

## Verify

Build, deploy to live :5099 (self-dev swap), browser-verify: open the dashboard in
Advanced, switch to Basic → it immediately reverts to the tabbed view; the entry button and
the shortcut do nothing in Basic; switching back to Advanced still works.
