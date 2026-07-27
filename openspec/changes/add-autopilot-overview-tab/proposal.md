# Add the Autopilot Overview tab — say what this is and where it's going

## Why

Autopilot accumulated features one by one — classifier suggestions, deterministic
loop mode, prompt mining, intercepts, audit — each individually built and
verified, and collectively disconnected and basically never used. The direction
is now explicit: **Autopilot is the dashboard for anything that prompts agents
automatically**, running on three everyday modes — the already-built
**suggestion-based loop** plus the planned **goal-based loop** and
**queue-based loop**. Nothing in the UI says any of this. The
console opens straight onto the Agents controls; a newcomer (or us, returning
after a month) sees nine tabs of machinery with no map of what exists, what
state it is honestly in, or what is planned. The identity and the plan live
only in chat history.

## What Changes

- A new **Overview** tab in `AutopilotConsole` — **first** in the tab strip and
  the **default selection** — appearing in both surfaces that render the console
  (the routed Autopilot tab and the dashboard pop-up).
- Its content, pure static reference (no backend calls):
  1. **What's here today** — an honest tab-by-tab inventory of the current
     surface (agents/arming + suggest vs auto-advance, loop mode, routine
     prompts + mining, intercepts/history/audit, system tests + explainers, the
     operator-gate safety posture), stated plainly as built-but-disconnected.
  2. **The plan** — autopilot as the home of automatic agent prompting,
     settling on three first-class modes: the **suggestion-based loop**
     (already built — the Agents-tab machinery: a library of custom routine
     prompts, and at each armed agent's turn end the classifier decides
     whether to send one, suggest-only or auto-advance), the **goal-based
     loop** (set a goal for one agent; the driven agent receives instructions
     on how the goal will be verified; a background agent verifies achievement
     at end of turn; optional run of the repo's committed `checks.ps1`
     verification script per the established pattern; stopping conditions /
     max turns) and the **queue-based loop** (a queue of prompts auto-sent at
     end of turn, with optional verification that the previous prompt produced
     what was expected before the next is sent).
- The Overview renders **even when the operator gate is closed**: today the 403
  gate screen replaces the whole console; after this change the tab strip and
  the Overview stay visible, and the gate notice shows only when an
  *operational* tab is selected. Reference content is never fenced.

Non-goals: no implementation of either loop feature here (that is its own
change — the in-flight `adopt-autopilot-loops` change predates this plan and
will be reworked to it before implementation); no backend or API changes; no
removal of existing tabs.

## Capabilities

### Modified Capabilities

- `autopilot-explainer`: gains the Overview requirement — the console's first
  and default tab, its inventory + plan content, and its gate exemption.

## Impact

- **Frontend only**: new `client/src/components/autopilot/AutopilotOverviewView.jsx`;
  `AutopilotConsole.jsx` (tab wiring, default tab, gate restructure);
  `client/src/pages/autopilot.css` (small `ov-*` additions reusing the `ca-*`
  explainer styles). The console is English-only like its sibling explainer
  tabs — no i18n keys. Reached only through the console, which is already
  Advanced-gated (`autopilotTab` capability) — no UiModeContext change.
