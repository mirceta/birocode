# autopilot-explainer — delta

## ADDED Requirements

### Requirement: The console opens on an Overview of what autopilot is and where it is going

The autopilot console SHALL present an **Overview** tab as the first tab in its
tab strip and as the default selection whenever the console opens, on both
surfaces that render the console (the routed Autopilot tab and the dashboard
pop-up). The Overview SHALL be pure reference content — it SHALL NOT require
any backend call to render — with two parts:

1. **Today**: a description of the autopilot surface as it currently exists,
   naming the operational areas (agent arming with suggest-only vs auto-advance,
   deterministic loop mode, the routine-prompt library and history mining, the
   intercepts/history/audit observability surfaces, and the host-only
   operator-gate safety posture), honest that these pieces are currently
   disconnected and largely unused.
2. **The plan**: autopilot's identity as the dashboard for anything that
   prompts agents automatically, and descriptions of its three first-class
   modes — the **suggestion-based loop** (already built: a small library of
   custom routine prompts is the label space; at each armed agent's turn end
   the classifier decides whether one of those prompts should be sent, in
   suggest-only or auto-advance posture), the **goal-based loop** (a goal set
   for one agent; the driven agent receives instructions on how the goal will
   be verified; a background agent verifies at end of turn whether the goal
   was achieved; optionally the repo's committed `checks.ps1` verification
   script runs as a deterministic check; stopping conditions / max turns bound
   the loop) and the **queue-based loop** (a queue of prompts auto-sent one
   per turn end, with optional verification that the previous prompt produced
   its expected result before the next prompt is sent). The suggestion-based
   mode SHALL be honestly marked as the one that exists today (the Agents-tab
   machinery), the other two as planned.

Because it is reference content, the Overview SHALL remain visible when the
operator gate is closed: with the gate closed, the tab strip and the Overview
still render, and the gate-closed notice is shown only when a non-Overview tab
is selected.

#### Scenario: Console opens on the Overview

- **WHEN** the End User opens the autopilot console (routed tab or dashboard
  pop-up)
- **THEN** the Overview tab is first in the tab strip and selected by default,
  showing the current-state inventory and the plan

#### Scenario: All three modes are described

- **WHEN** the End User reads the Overview's plan section
- **THEN** the suggestion-based loop is described with its custom routine
  prompts, the end-of-turn classifier decision, its suggest-only vs
  auto-advance postures, and the fact that it already exists — the goal-based
  loop is described with its goal, verification instructions to the driven
  agent, background-agent verification, optional `checks.ps1` run, and
  stopping conditions / max turns — and the queue-based loop is described with
  its auto-sent prompt queue and optional between-prompt verification

#### Scenario: Overview survives a closed operator gate

- **WHEN** the operator gate is closed (autopilot API answers 403) and the End
  User opens the console
- **THEN** the Overview still renders in full, and selecting an operational tab
  (e.g. Agents) shows the gate-closed notice instead of that tab's content
