## Why

The Autopilot console has grown to 10 flat tabs (Overview, Agents, Loops, Routine
prompts, Intercepted, Suggestion history, Audit, System tests, How chat works, How
autopilot works) with no visible structure: six of them belong to one loop type (the
suggestion-based loop), one tab holds a *different* loop type (the goal-based loop)
with two unrelated sections inside it, and three are pure reference. The flat row
hides which control belongs to which loop, and the Overview's three-mode plan
(suggestion-based / goal-based / queue-based) has no echo in the navigation.

## What Changes

- Replace the flat 10-tab row with a **two-level hierarchy**: 5 root tabs, two of
  which have subtab rows.
  - **Overview** — unchanged front page, still the default tab and still
    gate-exempt.
  - **Suggestion-based loop** — subtabs **Control** (was "Agents": kill switch,
    auto-advance, threshold, deny-list, per-agent arm), **Prompt library** (was
    "Routine prompts"), **Live feed** (was "Intercepted"), **History** (was
    "Suggestion history").
  - **Goal-based loop** — subtabs **Agents** (per-agent arm/status/stop-reason —
    the bottom half of today's "Loops" tab) and **Recipes** (its top half).
  - **Audit** — stays a root tab (it is the one cross-loop-type record); gains a
    **kind column** distinguishing suggestion-engine sends from loop resends
    (the backend already records `outcome` = `sent` vs `loop`).
  - **Reference** — subtabs **How autopilot works**, **How chat works**,
    **System tests**.
- Badge counts move with their views: active-loop count onto the Goal-based loop
  root tab, prompt count onto the Prompt library subtab, audit count stays on Audit.
- Pure restructure: no view is merged, redesigned, or removed; no backend or API
  change. The operator gate keeps fencing everything except Overview. The same
  hierarchy renders in both hosts of the single console implementation (routed
  Autopilot tab and dashboard dock).
- The queue-based loop gets no root tab (it does not exist yet); its card stays on
  the Overview.

## Capabilities

### New Capabilities

- `autopilot-console`: the console's navigation shell — the two-level tab
  hierarchy grouped by loop type, the default tab, the gate-exemption rule for
  Overview, single-implementation rendering in both hosts, and the audit trail's
  cross-loop-type kind distinction. (Seed-and-grow: the console shell had no spec;
  this change touches it, so its baseline starts here.)

### Modified Capabilities

<!-- none — autopilot-explainer's "reachable from the autopilot console" requirement
     stays satisfied under the Reference group; action-audit (host action audit) is a
     different capability and is untouched. -->

## Impact

- `client/src/components/autopilot/AutopilotConsole.jsx` — nav rewrite (root +
  subtab state), view re-homing, audit kind column.
- `client/src/components/autopilot/LoopsView.jsx` — split into the two Goal-based
  loop subviews (Agents / Recipes).
- `client/src/pages/autopilot.css` — subtab row styles.
- No backend, API, i18n-key removal, or UiMode capability-map changes. Dock host
  (`AutopilotPanel.jsx`) unaffected beyond rendering the same console.
