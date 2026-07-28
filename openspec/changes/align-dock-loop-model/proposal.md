## Why

The dock card's loop control predates the console's loop-type restructure
(`restructure-autopilot-tabs`). It says "⟳ Loop" and lists bare recipe names
("Drive the feature", "Finish and ship") with no framing: nothing tells the user
these arm a **goal-based loop**, and the **suggestion-based loop** — armable
per-agent in the console's Control subtab — has no presence on the dock at all.
The dock speaks a vocabulary ("recipes") the restructured console never
introduces, which the user read as "wtf".

## What Changes

- The dock loop popover becomes **two labeled sections mirroring the console's
  loop-type roots**, each with a one-line description:
  - **💡 Suggestion-based loop** — this agent's arm/disarm toggle (the same
    per-agent arming as the console's Control subtab, via the existing gated
    config action) plus its current state (not armed / suggest-only /
    auto-advance).
  - **🎯 Goal-based loop** — the existing recipe picker + cap + arm/stop,
    unchanged in behavior, now framed under a visible "Recipes" label.
- The **badge row is typed by loop type**: the goal-loop badge gains a 🎯
  prefix (iterations while looping, terminal states as today); a distinct 💡
  marker shows while the repo is suggestion-armed.
- The read-only, non-operator-gated `GET /api/autopilot/loops` projection
  additionally discloses **suggestion-arming status**: the armed repo ids, the
  global auto-advance flag, and the kill switch — status only; still no
  prompts, threshold, deny-list, or action surface. Arming stays fully gated
  (403 → the existing gate-closed hint).
- The **queue-based loop stays off the dock** — it does not exist yet; its
  plan card stays on the console Overview.

## Capabilities

### Modified Capabilities

- `agent-dock`: the dock loop control's presentation contract changes from a
  flat recipe list to the loop-type-grouped popover, adds suggestion-loop
  arming, and types the badge.
- `autopilot-loops`: the ungated read-only projection's disclosure boundary
  widens to include suggestion-arming status (an ADDED requirement; the
  existing loop-status requirement is untouched).

## Impact

- `ClaudeWeb.App/Controllers/AutopilotController.cs` — `Loops()` adds
  `suggestionArmedRepoIds`, `autoAdvance`, `suggestionEnabled`.
- `client/src/components/dashboard/DockLoopControl.jsx` — two-section popover,
  typed badge, suggestion arm action.
- `client/src/pages/Dashboard.jsx` + `PinnedAgent.jsx` — plumb the suggestion
  status from the existing loops poll down to the control.
- `client/src/pages/dashboard.css`, `client/src/i18n/en.json` + `tr.json` —
  section styles and labels. No capability-map change (same
  `dockLoopControls` Advanced gate).
