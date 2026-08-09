# Delta: autopilot-loops — loop-state-param-panel

## ADDED Requirements

### Requirement: Phased loop parameters are presented as state-machine sections

The dock loop popover SHALL present the parameters of the phased driven kinds
(goal, queue) grouped into ordered sections that mirror the engine's state
machine: a LOOP-WIDE section for parameters belonging to no single state (goal
text, turn cap, queue binding, per-step verification toggle, deny-list), then
one section per parameter-bearing state named with its state name
(WORKING_STATE, VERIFICATION_STATE). Each state section SHALL contain: the
parameters that state uses (prompt templates rendered as labeled read-only
parameter boxes — no longer behind an inspection toggle), an explicit
badge/exit control ("agent emits badge: <token>" where the engine expects a
sentinel — `LOOP_DONE`, `GOAL_VERIFIED`, `STEP_VERIFIED` — or the stated
badge-less exit trigger for the queue's working state), and explicit
transition lines stating what the loop system does for every outcome of that
state, including the terminal outcomes (`DONE · VERIFIED`, `DONE · DRAINED`,
`ESCALATE · STEP-UNVERIFIED`) and the queue's verification-off
stay-in-work variant. The sections SHALL render in both the arming view
(composed from the gated detail templates) and the armed view (the instance's
stored copies); a closed operator gate SHALL replace only the gated template
text with the gate hint, never the section structure, badges, or transition
lines. The recipe and suggestion kinds are unaffected. All non-token labels
SHALL be localized (en, tr).

#### Scenario: Queue sections make the dynamics knowable from the panel

- **WHEN** the operator selects the queue kind with items stashed and the gate open
- **THEN** the panel shows LOOP-WIDE (binding, verification toggle, deny chips,
  cap), WORKING_STATE holding the unload-order list with a badge-less exit
  trigger ("the step's turn finishes") and a transition line into
  VERIFICATION_STATE, and VERIFICATION_STATE holding the verification template
  box, a control reading "agent emits badge: STEP_VERIFIED", and transition
  lines for next-step, `DONE · DRAINED`, and `ESCALATE · STEP-UNVERIFIED`

#### Scenario: Goal sections pair each template with its badge and transition

- **WHEN** the operator selects the goal kind and types a goal with the gate open
- **THEN** WORKING_STATE shows the work-prompt template composed with that goal
  plus "agent emits badge: LOOP_DONE" transitioning into VERIFICATION_STATE,
  and VERIFICATION_STATE shows the verification template plus
  "agent emits badge: GOAL_VERIFIED" ending in `DONE · VERIFIED`, with the
  gaps-found line returning to WORKING_STATE

#### Scenario: Armed view keeps the full parameter panel

- **WHEN** a goal loop is armed and the operator opens the popover
- **THEN** the same sections render read-only from the instance's stored goal
  and prompts — the armed popover is no longer parameter-less

#### Scenario: Closed gate degrades template boxes only

- **WHEN** the operator gate is closed and the popover is opened on the queue kind
- **THEN** the sections, state names, badge control, and transition lines still
  render, and only the template/stored-prompt boxes show the gate hint

### Requirement: The parameter panel surfaces the armed loop's live state

While a goal/queue loop is armed and active, the dock SHALL light the section
of the machine's current state (`work` → WORKING_STATE; `verify-owed` and
`verify` → VERIFICATION_STATE) with a "now" marker, SHALL render a compact
state strip in the armed popover header showing every live phase chip in flow
order with the current phase lit (`verify-owed` distinct from `verify`) and
terminal instances lighting the matching outcome pill, and the collapsed dock
summary's phase word SHALL name the actual phase (`work` stays silent,
unknown phase values render raw, never blank). Phase and status SHALL come
from the ungated loops projection so these readouts survive a closed gate.

#### Scenario: Verify-owed is visible and lights the verification section

- **WHEN** an armed queue loop's step lands and its phase is `verify-owed`
- **THEN** the header strip lights the `verify owed` chip, the
  VERIFICATION_STATE section carries the "now" marker, and the collapsed
  summary shows the verify-owed word

#### Scenario: Terminal outcome lights its pill, not a section

- **WHEN** a queue loop ends with status `escalate` and a step-unverified stop reason
- **THEN** no section carries the "now" marker and the strip lights the
  `ESCALATE · STEP-UNVERIFIED` pill

## MODIFIED Requirements

### Requirement: The dock loop popover is controls-only; reference copy lives in the console

The dock loop popover SHALL contain controls and consequence disclosures only:
the kind picker, the selected kind's parameters (for phased kinds, the
state-sectioned parameter panel), prompt inspection for the recipe kind, the
pending/decision readouts, and Arm/Disarm/Resume. It SHALL NOT render per-kind
description paragraphs or per-mode explanation paragraphs; at most one short
pointer line MAY name where the full explanations live. Consequence
disclosures are exempt and SHALL remain (queue binding line, deny-list chips
and trims, verification hints, replace-warning, gate/error hints, and the
state sections' badge controls, one-line dynamics descriptions, and transition
lines — these state what the surrounding parameters do, they are not relocated
reference copy). The autopilot console's Loops tab SHALL render the relocated
reference copy — each loop kind with its description and the suggest-vs-drive
contrast — as static content requiring no backend call.

#### Scenario: Popover shows controls without prose

- **WHEN** the operator expands an agent's loop section and cycles through the four kinds
- **THEN** no kind-description or mode-explanation paragraph renders, while the kind picker, parameters (state-sectioned for goal/queue), inspection (recipe), and arm controls render

#### Scenario: Consequence disclosures survive the declutter

- **WHEN** the operator selects the queue kind with items stashed
- **THEN** the binding line, unload-order preview, verification toggle with its hint, deny-list chips, and the sections' badge and transition lines still render

#### Scenario: Console carries the explanations

- **WHEN** the End User opens the autopilot console's Loops tab
- **THEN** a reference block describes every loop kind and the suggest-vs-drive modes, rendered without any backend call
