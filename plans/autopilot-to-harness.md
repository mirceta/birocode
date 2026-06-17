# Autopilot goes to the harness — promote the dashboard from a local app into the harness

> Editing this plan? First read [doc principles](doc-principles.md).
> Part of the **[loop-autopilot](loop-autopilot.md)** family — this plan only covers *where the
> autopilot dashboard lives*; the brain/engine/safety subdocs are unchanged.

> **Status (2026-06-17): KICKOFF — interpreting + scoping.** On `feature/autopilot-to-harness`,
> off `main`. Scope settled — see **Decisions (locked)**. **Progress:** Part 1 port done
> (Intercepted feed + deny-list into the harness tab); Part 2 first cut done (a first-class
> **Autopilot section on the agent dashboard** — `AutopilotPanel`). Both deployed to live :5099.

## Goal

Two parts, both confirmed:

1. **De-duplicate toward the harness tab.** The autopilot **dashboard is currently DUPLICATED**:
   a build-less local app at `autopilot-app/` (served per-repo under
   `/api/localview/<repo>/app/autopilot/`) **and** a first-class routed harness tab
   (`client/src/pages/Autopilot.jsx`), both reading the same `/api/autopilot`. Bring the harness
   tab to parity, then delete the local app.
2. **Elevate to box-level cross-agent operation.** The harness tab becomes a **mission-control
   over all agents at once** (global controls layered over per-agent arm), not per-repo arm
   sets. Detail in **Cross-agent operation** below.

> **Correction (2026-06-17):** an earlier draft of this plan framed it as "the dashboard only
> shipped as the local app; move it into the harness (finish option A)." That was wrong — option
> A (the harness tab) *was* built **and** option B (the local app) was built on top of it. Both
> exist in parallel; this is a consolidation, not a first-time move. Verified in code (see below).

## The duplication, verified in code

| | Harness tab — `client/src/pages/Autopilot.jsx` (~434 lines) | Local app — `autopilot-app/` (~822 lines) |
|---|---|---|
| Status | Routed: `App.jsx` `Route path="autopilot"` + `tabRegistry.jsx` (key `autopilot`, flag `autopilotTab`) | Build-less app at `/api/localview/<repo>/app/autopilot/` |
| Subtabs | agents · prompts · history · audit (**4**) | agents · prompts · **intercepts** · history · audit (**5**) |
| Data | `/api/autopilot`, `/prompts`, `/discover`, `/config` | same `/api/autopilot` + `/discover` |

The **only real gap** is the local app's **Intercepted** live feed (the harness tab has no
`intercept` view). The local app is, ironically, the *more complete* of the two.

## Why de-duplicate toward the harness tab (not the local app)

- **One source of truth.** Two hand-maintained dashboards over one API is exactly the drift we
  fight — and they're already diverging (the Intercepted feed exists in only one).
- **Live data is first-hand in the harness.** The harness tab is same-origin + authenticated
  with direct access to live state; the static app only sees what `/api/autopilot` exposes.
- **Per-repo scoping is wrong** for a box-level feature — the local app is mounted under one
  repo's `localview`; the harness tab is global.

## Where it is now (don't rebuild)

- **Backend (untouched):** `Services/Autopilot/*` (`AutopilotService` polling
  `BackgroundService`, `AutopilotConfigStore` → `autopilot.json`, `AutopilotGate`,
  `AutopilotAuditLog`, `AutopilotDiscoveryService`) + `AutopilotController`
  (`GET /api/autopilot`, `/discover`, `POST /api/autopilot/config`).
- **Two dashboards** as tabulated above — the harness tab is the keeper; the local app is the
  one to retire (after porting its Intercepted feed).

## Sketch of the work (refine after scope is confirmed)

1. **Port the `Intercepted` feed** from `autopilot-app/` into `Autopilot.jsx` as a 5th subtab —
   the one piece the harness tab is missing (`InterceptEvent` is already in `/api/autopilot`).
2. **Diff the other four subtabs** (agents/prompts/history/audit) for any local-app-only
   refinements; fold anything worth keeping into the harness tab.
3. **Delete `autopilot-app/`** and its `localview` app registration once parity is verified.
4. **Gating unchanged** — stays operator-side off by default per
   [safety](loop-autopilot-safety.md); this is UI consolidation, not a trust change.
5. **i18n + self-dev build** as usual.

## Decisions (locked 2026-06-17)

- **Cross-agent operation: YES.** The feature is **not just de-dup** — the harness tab becomes a
  box-level **mission-control over all agents at once**, not per-repo arm sets. This *reinforces*
  keeping the global harness tab over the per-repo local app, and pushes work into the backend
  (see "Cross-agent operation" below), so it's no longer frontend-only.
- **Self-Development: default — no special-casing.** The Harness's own repo works through the
  same tab like any other agent; we don't build self-dev-specific behaviour.
- **Always-on / ungate: default — NO.** The operator-side gate stays off by default per
  [safety](loop-autopilot-safety.md). Consolidation + cross-agent UI is not a trust change.

## Cross-agent operation (what "YES" adds)

Today arming/threshold/kill live per-agent/per-repo in `autopilot.json`
(`AutopilotConfigStore`); the dashboard shows one repo at a time. Box-level operation means:

- **Global controls** — a single enable + threshold + **kill switch for the whole wall**,
  layered over (not replacing) per-agent arm so you can still opt individual agents in/out.
- **One unified view of every agent** on the box (the harness tab is already global; the local
  app couldn't be — another reason it's the one to retire).
- **Backend touch (scoped):** ~~extend `AutopilotConfigStore` with a global stanza~~ — **not
  needed.** Found during build: the backend **already** holds global `enabled` / `autoAdvance` /
  `threshold` (the tab mutates them with no `repoId`) **plus** per-agent `armed`. So "global
  controls layered over per-agent arm" is already the data model; cross-agent operation is a
  **pure surfacing job**.

### Built — Autopilot section on the agent dashboard (2026-06-17)

`components/dashboard/AutopilotPanel.jsx` (+ `autopilot-panel.css`), rendered as a full-width
collapsible band above the Ideas/agents flow in `Dashboard.jsx` (modeled on `Scoreboard`;
per-device collapse; gated on the `autopilotTab` feature). It is the box-level mission-control:

- **Global controls** — enable / kill, auto-advance, threshold — over the whole wall.
- **Deny-list** transparency line.
- **Compact per-agent row** — state badge + prediction + arm/disarm — for every agent at once,
  with a **"N need you"** escalation rollup in the collapsed bar.

Reuses `/api/autopilot` + the `ap-*` styles; the Autopilot **tab** stays the detailed surface
(intercepts / history / audit / prompts). Possible later cleanup: extract the shared bar +
agent-row into one component used by both tab and panel (currently the JSX is similar).

## Out of scope

- Not swapping the stub classifier for the real `claude`-CLI brain (that's
  [loop-autopilot.md](loop-autopilot.md) Slice 2's remaining work, tracked there).
- No ungating / always-on promotion (see Decisions).
- No self-dev-specific behaviour (see Decisions).
