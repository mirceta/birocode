# Autopilot goes to the harness — promote the dashboard from a local app into the harness

> Editing this plan? First read [doc principles](doc-principles.md).
> Part of the **[loop-autopilot](loop-autopilot.md)** family — this plan only covers *where the
> autopilot dashboard lives*; the brain/engine/safety subdocs are unchanged.

> **Status (2026-06-17): KICKOFF — interpreting + scoping.** On `feature/autopilot-to-harness`,
> off `main`. Primary interpretation below; alternative readings in **Open questions** (the user
> declined to pin scope up front, so we proceed on the default and confirm as we go).

## Goal (primary interpretation)

Today the autopilot **dashboard** is the build-less local app at `autopilot-app/`, served
per-repo under `/api/localview/<repo>/app/autopilot/`. Move it **into the harness itself** as a
first-class React surface — i.e. finish the migration to **option A** that
[loop-autopilot-dashboard.md](loop-autopilot-dashboard.md) locked but never completed (the
dashboard shipped as the local app, option B-ish, as an interim home).

"Goes to the harness" = the autopilot stops being a Product-style local app and becomes part of
**Claude Web itself** — same origin, authenticated, with direct in-process access to live
`RunSession`/agent state instead of reaching everything through `/api/autopilot` from a
sandboxed static folder.

## Why now (what the local-app form costs)

Per the dashboard subdoc's own scoring, the local-app home was always the weaker fit:

- **Live data is second-hand.** The static app only sees what `/api/autopilot` exposes; a
  harness surface reads autopilot + agent state directly (option A's 5★ vs B's 3★).
- **A second framework-less codebase** (`autopilot-app/` HTML/CSS/JS) drifts from the harness
  UI it mirrors (it's already "styled to the design mock in `understanding-app/`").
- **Per-repo scoping is wrong for a harness-level feature** — autopilot watches agents across
  the box, but a local app is mounted under one repo's `localview`.

## Where it is now (don't rebuild)

- **Backend (already in the harness):** `Services/Autopilot/*` (`AutopilotService` polling
  `BackgroundService`, `AutopilotConfigStore` → `autopilot.json`, `AutopilotGate`,
  `AutopilotAuditLog`, `AutopilotDiscoveryService`) + `AutopilotController`
  (`GET /api/autopilot`, `/discover`, `POST /api/autopilot/config`). **This stays.**
- **Dashboard (to migrate):** `autopilot-app/` local app with subtabs **Agents /
  Intercepted / Suggestion history / Auto-sent** (see
  [dashboard subdoc](loop-autopilot-dashboard.md#live-local-app--tabs-2026-06-17)).
- **Harness tab (the target home):** `client/src/pages/Autopilot.jsx` already exists from
  Slice 1 (discovery) — the migration grows it to host the four subtabs.

So this is mostly a **frontend relocation + consolidation**: re-implement the `autopilot-app/`
views as React inside the harness Autopilot tab, reading the same `/api/autopilot` data (and,
where it helps, in-process state), then retire the local app.

## Sketch of the work (refine after scope is confirmed)

1. **Port the four subtabs** (Agents, Intercepted, Suggestion history, Auto-sent) into
   `Autopilot.jsx` as React components, reusing the live `/api/autopilot` shape.
2. **Wire arm/disarm, threshold, auto-advance, kill switch** through the existing
   `POST /api/autopilot/config` (no backend change expected).
3. **Retire `autopilot-app/`** (and its `localview` app registration) once parity is verified.
4. **Gating unchanged** — stays operator-side off by default per
   [safety](loop-autopilot-safety.md); this move is UI-location only, not a trust change.
5. **i18n + self-dev build** as usual.

## Out of scope (unless an Open question says otherwise)

- No change to the **brain/engine/gate/safety** — purely where the dashboard lives.
- Not swapping the stub classifier for the real `claude`-CLI brain (that's
  [loop-autopilot.md](loop-autopilot.md) Slice 2's remaining work, tracked there).
- No ungating / always-on promotion.

## Open questions (the readings to confirm)

- **Is this UI-relocation only** (primary interpretation), **or** also **harness-level
  cross-agent operation** — one autopilot watching the whole agent-dashboard wall rather than
  per-repo arm sets?
- **Self-Development:** should it explicitly target the Harness's own repo (autopilot driving
  work on Claude Web itself)?
- **Always-on:** does "goes to the harness" also mean promoting it from gated experiment to a
  permanent, ungated capability? (Default: **no** — keep the operator gate.)
