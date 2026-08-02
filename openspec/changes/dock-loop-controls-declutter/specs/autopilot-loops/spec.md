## ADDED Requirements

### Requirement: The dock mode control is a single drive checkbox on the loop header row

The agent dock's loop section SHALL expose the suggest/drive mode as one
compact Drive checkbox on the section's header row, right-aligned next to the
summary button that expands the section, visible in both collapsed and
expanded states. Checked SHALL mean drive mode (the loop sends its own
prompts, capped and audited); unchecked SHALL mean suggest-only (the loop's
next prompt pre-fills the composer). Toggling SHALL flip a live armed
instance's mode in place via the existing mode action when the selection is
the armed kind, and otherwise SHALL set the mode the next arm request carries.
Mode defaults are unchanged (suggestion kind defaults to suggest, driven kinds
to drive). The popover SHALL NOT render a separate full-row mode radiogroup.

#### Scenario: Flip a live loop without opening the popover

- **WHEN** a queue loop is armed in drive mode and the operator unchecks the Drive checkbox on the collapsed header row
- **THEN** the instance's mode flips to suggest in place via the mode action, without disarming and without the popover opening

#### Scenario: Checkbox seeds the next arm

- **WHEN** no loop of the selected kind is armed and the operator unchecks Drive, then arms a goal loop
- **THEN** the arm request carries suggest mode and the instance arms suggest-only

#### Scenario: Gate-closed flip fails visibly on the collapsed row

- **WHEN** the operator gate is closed and the operator toggles the checkbox while the popover is collapsed
- **THEN** the gate-closed hint renders under the header row (not only inside the popover) and the mode is unchanged

### Requirement: The dock loop popover is controls-only; reference copy lives in the console

The dock loop popover SHALL contain controls and consequence disclosures only:
the kind picker, the selected kind's parameters, prompt inspection, the
pending/decision readouts, and Arm/Disarm/Resume. It SHALL NOT render per-kind
description paragraphs or per-mode explanation paragraphs; at most one short
pointer line MAY name where the full explanations live. Consequence
disclosures are exempt and SHALL remain (queue binding line, deny-list chips
and trims, verification hints, replace-warning, gate/error hints). The
autopilot console's Loops tab SHALL render the relocated reference copy — each
loop kind with its description and the suggest-vs-drive contrast — as static
content requiring no backend call.

#### Scenario: Popover shows controls without prose

- **WHEN** the operator expands an agent's loop section and cycles through the four kinds
- **THEN** no kind-description or mode-explanation paragraph renders, while the kind picker, parameters, inspection, and arm controls are unchanged

#### Scenario: Consequence disclosures survive the declutter

- **WHEN** the operator selects the queue kind with items stashed
- **THEN** the binding line, unload-order preview, verification toggle with its hint, and deny-list chips still render

#### Scenario: Console carries the explanations

- **WHEN** the End User opens the autopilot console's Loops tab
- **THEN** a reference block describes every loop kind and the suggest-vs-drive modes, rendered without any backend call
