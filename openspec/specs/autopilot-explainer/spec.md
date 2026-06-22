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
(errored → sentinel/done → deny-list/escalate → iteration cap → otherwise resend),
advancing an iteration count and reporting the outcome of each turn. The simulator SHALL
operate entirely client-side and SHALL NOT send anything to a real agent.

#### Scenario: Loop resends while still working

- **WHEN** the reader arms the loop and reports that the agent is still working (no finish signal, nothing risky, cap not reached)
- **THEN** the simulator resends, the iteration count advances, and the loop continues

#### Scenario: Loop stops on the finish signal

- **WHEN** the reader reports that the agent replied with the agreed finish (sentinel) phrase
- **THEN** the simulator stops the loop as done and does not resend

#### Scenario: Loop escalates on a deny-listed action

- **WHEN** the reader reports that the agent proposed a deny-listed action (e.g. a risky word)
- **THEN** the simulator stops and escalates rather than resending

#### Scenario: Loop stops at the iteration cap

- **WHEN** the loop reaches its configured iteration cap
- **THEN** the simulator stops and marks the loop capped
