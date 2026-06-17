# Understanding — Autopilot goes to the harness

## Goal (corrected)
The autopilot dashboard is currently **DUPLICATED**: it exists both as a first-class, routed
**harness tab** (`client/src/pages/Autopilot.jsx`) **and** as a separate build-less **local
app** (`autopilot-app/`, served under `/api/localview/<repo>/app/autopilot/`) — both reading
the same `/api/autopilot`. "Goes to the harness" = **de-duplicate toward the harness tab**:
reach parity, then delete the local app.

## Correction to my earlier framing
An earlier draft (and the first understanding-app) said the dashboard "only shipped as the local
app" and needed to be "moved into the harness." **That was wrong** — you caught it. Verified in
code: the harness tab *and* the local app both exist. This is a **consolidation**, not a
first-time move.

## What I verified in code
| | Harness tab (`Autopilot.jsx`, ~434 lines) | Local app (`autopilot-app/`, ~822 lines) |
|---|---|---|
| Status | Routed (`App.jsx` + `tabRegistry.jsx`, flag `autopilotTab`) | `/api/localview/<repo>/app/autopilot/` |
| Subtabs | agents · prompts · history · audit (4) | agents · prompts · **intercepts** · history · audit (5) |

The **only real gap**: the local app has an **Intercepted** live feed the harness tab lacks.
The local app is actually the more complete of the two.

## The work (sketch)
1. Port the **Intercepted** feed into `Autopilot.jsx` (the missing 5th subtab).
2. Diff the other four subtabs; fold any local-app-only refinements into the harness tab.
3. **Delete `autopilot-app/`** + its localview registration once at parity.
4. Backend (`Services/Autopilot/*`) and the operator gate stay unchanged.

## Decisions (locked 2026-06-17)
- **Cross-agent operation: YES** — the harness tab becomes box-level mission-control over all
  agents (global enable/threshold/kill layered over per-agent arm), not per-repo arm sets. This
  adds a small backend touch (`AutopilotConfigStore` global stanza + `AutopilotService` honours
  it), so the feature is no longer frontend-only.
- **Self-dev: default** — no special-casing; the Harness's own repo is just another agent.
- **Ungate: default — NO** — operator gate stays off by default.
