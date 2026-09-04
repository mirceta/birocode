# Autopilot explainer

## Purpose

Makes the autopilot subsystem legible from inside the app. The operational autopilot tabs
show *state* (which agents, which loops, what got intercepted) but never *how autopilot
decides and acts*: what opens the host-only gate, what runs on each tick, how the two
drivers (the keyword classifier and deterministic loop mode) differ, and which fences stop
a runaway loop. This capability is the one surface that answers "how does autopilot
actually work?" — as an interactive diagram drawn from, and citing, the real
implementation, plus a hands-on simulator of the per-turn loop decision. It is pure
reference content and never touches live autopilot state.
## Requirements
### Requirement: Present the autopilot subsystem as an in-app interactive explainer

The system SHALL provide an in-app explainer of the autopilot subsystem, reachable from
the autopilot console, that presents how autopilot decides and acts — the host-only gate,
the periodic tick, the two drivers (the keyword classifier and deterministic loop mode),
the shared single-writer builder slot, and the safety fences — as an interactive diagram
rather than prose alone. The explainer SHALL offer multiple selectable views (at least an
overview, a system map of the whole subsystem, a per-turn decision flow, and a safety-fences
view) and SHALL let the reader inspect an individual element to see its role. The explainer
SHALL be reference content only: it SHALL NOT call the backend or mutate autopilot state,
and each element SHALL cite the real implementation it describes so the diagram stays honest
against the code.

#### Scenario: Open the explainer

- **WHEN** the End User opens the "How autopilot works" view from the autopilot console
- **THEN** the autopilot subsystem is shown as an interactive diagram with selectable views (overview, system map, per-turn decision, safety fences), and no backend call is required to render it

#### Scenario: Inspect an element

- **WHEN** the End User selects a node or box in the system map
- **THEN** its role is shown along with a citation of the real implementation file it represents

#### Scenario: Switch views

- **WHEN** the End User switches between the explainer's views
- **THEN** the corresponding diagram (e.g. the per-turn decision flow or the safety-fences layer) is shown without leaving the explainer

### Requirement: Drive the loop decision by hand in a simulator

The explainer SHALL include a hands-on simulator of deterministic loop mode that lets the
reader drive the per-turn decision by hand instead of only reading it. The reader SHALL be
able to arm the loop and then supply, turn by turn, what the agent replied, and the
simulator SHALL apply the same deterministic check order loop mode uses
(errored → sentinel/done → needs-human/escalate → iteration cap → otherwise resend),
advancing an iteration count and reporting the outcome of each turn. The simulator SHALL
operate entirely client-side and SHALL NOT send anything to a real agent.

#### Scenario: Loop resends while still working

- **WHEN** the reader arms the loop and reports that the agent is still working (no finish signal, no escalation, cap not reached)
- **THEN** the simulator resends, the iteration count advances, and the loop continues

#### Scenario: Loop stops on the finish signal

- **WHEN** the reader reports that the agent replied with the agreed finish (sentinel) phrase
- **THEN** the simulator stops the loop as done and does not resend

#### Scenario: Loop escalates when the agent needs the human

- **WHEN** the reader reports that the agent replied with `NEEDS_HUMAN:` and a question
- **THEN** the simulator stops and escalates rather than resending

#### Scenario: Loop stops at the iteration cap

- **WHEN** the loop reaches its configured iteration cap
- **THEN** the simulator stops and marks the loop capped

### Requirement: Present a test-coverage map of the loop engine

The autopilot console SHALL provide a Tests surface that states, in plain language, what
automated test coverage the loop engine has and what it does not have. The surface SHALL
present the layers separately — the unit-test suite (what it covers and the seams that
make it testable), the in-app runnable browser tests, and the end-to-end eval layer
(the committed `tests/loop-eval/` suite: what its scenarios prove, that runs cost real
agent turns and minutes, and how to launch it from the CLI in both of its run modes —
the default fully-automatic isolated mode and the opt-in live mode observable in this
harness's own UI; never CI) —
and SHALL state the known coverage gap and the plan to close it. Documentation subtabs
SHALL be pure reference content requiring no backend call; the runnable browser-test
subtab SHALL reuse the existing system-tests machinery unchanged. The stated facts SHALL
cite the real files they describe so the map stays honest against the code.

#### Scenario: Read the coverage map

- **WHEN** the End User opens the Tests tab in the autopilot console
- **THEN** subtabs for the unit-test layer, the runnable browser tests, the end-to-end eval layer, and the coverage-gap plan are shown, and the documentation subtabs render without any backend call

#### Scenario: Run a browser test from the map

- **WHEN** the End User opens the Tests tab's browser-tests subtab
- **THEN** the existing runnable system tests are shown there with unchanged behavior (run, live output, screenshot artifact)

#### Scenario: Eval layer described as tracked and launchable

- **WHEN** the End User opens the Tests tab's end-to-end subtab
- **THEN** it describes the committed loop-eval suite — its two scenarios, the real-token cost, and the CLI launch commands for both run modes (isolated default and live/observable), including the live mode's prerequisites (gate, kill switch, password) — rather than describing the layer as untracked scratch scripts

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

