# Design — Execution | Management dashboard split

## The layer model

| Term | Definition |
|------|------------|
| Harness | The deployed Claude Web app on each box: runs, loops, arch brain, collector. Redeploy = build + swap + dead-man switch. |
| Execution Dashboard | The current dashboard: docks grid (always-on), Autopilot and Agent-audit panels. Box-scoped. |
| Management Dashboard | New parallel view: the Arch surface + Ideas. Fleet-scoped direction-setting. |
| Management App | Phase 2 destination: the events app grown into a standalone static page calling Harness REST. |
| Arch Backend | The arch agent's server side (tools, loop, fleet client, audit). In-process C#; never moves. |

## D1. Two views, one overlay

The dashboard overlay (and its tab-view twin) gains a two-tab header:
**Execution | Management**. Execution renders exactly today's dashboard minus
the Ideas/Arch chips. Management renders the Arch page (primary column, all
three lanes, scope picker, fleet card — the component as-is) beside the Ideas
panel. The active view persists per device (same storage pattern as panel
visibility). Entry points (title button, Ctrl/Cmd+Shift+D, Escape) are
unchanged and view-agnostic: the overlay reopens on the last active view.

## D2. Move, don't copy

Ideas and Arch leave the Execution rail entirely. One home per feature: a
feature reachable from two dashboards would split its layout state and confuse
"where was I". The studio's own Ideas and Arch tabs (routes) are untouched —
they remain the deep links; the Management view is the dashboard-level home.

## D3. Components move mounts, not logic

`Arch` (with `popup`-style embedding) and `IdeasPanel` are mounted by the
Management view exactly as the rail pop-up and panel mounted them. No new
props beyond what embedding needs, no state moves, no API changes. This is the
guarantee that phase 2 can lift the same components into the Management App.

## D4. Phase 2 destination (recorded, not implemented here)

The Management App = the events app pattern applied to the whole management
layer: one self-contained static page + tiny server, launched detached, viewed
through the localview proxy so its API calls are same-origin and the session
cookie authorizes them. It speaks REST to ONE home harness only; fleet reach
comes from the harness's existing server-side relays (collector pulls, peer
API, ideas hub). Rationale: a browser page calling N harnesses directly means
CORS + credential sprawl; the collector pattern already solves this.

Rejected: making the event feed a first-class harness citizen (option B) —
that moves the fast-iterating surface onto the slow deploy train. Noted but
not chosen: hot-swapping live's client/dist without a restart would ease the
redeploy pain alone, but provides no separation of concerns and no app that
outlives a single harness.

## D5. Constraints restated

- The Arch Backend stays in the Harness (2026-09-02 decision; phase 2 moves
  faces only).
- Advanced mode only, like the dashboard itself (`agentDashboard` feature);
  Basic mode never sees either view.
- The Execution view's docks grid, free-drag/grid layout systems, and the
  Autopilot/Audit panels behave exactly as today.
