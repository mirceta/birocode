# Split the dashboard into Execution and Management views

## Why

The dashboard's four summonable panels are two different kinds of tool. Autopilot
and Agent Audit answer "what is running on this box and what did it do" —
execution. The Arch agent and Ideas answer "what should the fleet work on next" —
management. Today all four share one panel rail, so the management surfaces sit
as widgets among execution widgets, and the Arch agent — which can grow many
more tools — has no room of its own. Underneath, the split already exists:
management features are fleet-scoped (arch scopes remote repos, Ideas syncs via
the hub), execution features are box-scoped (docks, runs, loops, audit). The UI
should match.

## What changes (phase 1)

1. The dashboard becomes two parallel top-level views under one overlay:
   **Execution** (the current dashboard: docks grid, Autopilot and Agent-audit
   panels) and **Management** (new: the full Arch surface and the Ideas panel).
   A two-tab header switches views; the choice persists per device.
2. The Ideas chip and the Arch chip leave the Execution panel rail. Autopilot
   and Agent-audit chips stay. The docks grid stays always-on in Execution.
3. The Arch page and Ideas panel components are reused unchanged — this change
   moves mounts, not logic. Entry (title button, Ctrl/Cmd+Shift+D), Advanced-mode
   gating and Basic-mode behaviour are untouched.

## What this sets up (phase 2, recorded in design.md, NOT in this change)

The Management view's destination is the events app grown into a standalone
**Management App**: a static, refresh-to-update page that hosts the events feed
plus the Arch and Ideas UIs and calls this harness's REST APIs same-origin
through the localview proxy. Backends never move — the arch brain, run slot and
fleet credentials stay in the harness (the 2026-09-02 decision stands). Phase 1
is deliberately mounts-only so phase 2 lifts the same components without
unwinding anything.

## Impact

- `client/src/pages/Dashboard.jsx` (view switch, Management view), panel-rail
  chip set, dashboard CSS, i18n
- specs: new capability `management-dashboard` (ADDED); `dashboard-panels`
  (MODIFIED: rail loses Ideas, gains nothing); `arch-agent` (MODIFIED: the
  desktop reaches Arch via the Management view instead of a rail pop-up)
- No server changes.
