# Dashboard opens from the header title

> **Status (2026-06-15):** **Built, browser-verified & merged to main**
> (not yet deployed to :5099). On `feature/dashboard-title-button`. Moves the
> agent-dashboard entry point from the standalone top-bar **Dashboard** button
> onto the top-left `machine · project · branch` title, which becomes a button
> (accent-filled while the dashboard is open). Verified on an isolated :5210
> instance (`.preview-test/dashboard-title-button-check.mjs`, ALL PASS).

## Problem

The agent dashboard (plans/agent-dashboard.md) is reached via a separate
**Dashboard** button in the header actions (`DashboardButton` in
`layout/Layout.jsx`, next to HELLO). The top-left `machine · project · branch`
label (`HeaderTitle`) is just static text. The user wants the label itself to be
the way in — click it to open the dashboard — and the standalone button gone.

## Design (`client/src/layout/Layout.jsx`, `styles/global.css`)

- Remove `DashboardButton` from `.app-header__actions`.
- `HeaderTitle` becomes a clickable button that toggles `dashOpen` (lifted from
  `StudioShell`, the same state the old button drove). Same displayed text.
- **Preserve the existing gating:** the old button only showed in Advanced mode
  with 2+ agents (`agentDashboard` feature + `tabs.length >= 2`). So the title is
  interactive only when the dashboard is available; otherwise it stays a plain
  `<h1>` label (today's behavior).
- Styling: hover affordance + an active state while the dashboard is open
  (reuse the `dash-btn--active` look); keep the shortcut tooltip.

## Verification

- Browser-verify (per `docs/claude-web/browser-testing.md`) on an isolated
  instance: 2+ agents / Advanced — title shows machine·project·branch, click
  opens the dashboard, click again closes it (active toggles), standalone button
  gone; <2 agents — title is a plain label.
