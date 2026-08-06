# prompt-footer-clauses Specification

## Purpose
TBD - created by archiving change prompt-footer-clauses. Update Purpose after archive.
## Requirements
### Requirement: Footer-clauses button on the composer

The chat composer SHALL show a footer-clauses button on the left side of the input
row, next to the existing custom-prompts and expand buttons, that opens the
footer-clauses popup. The button SHALL be present wherever those sibling buttons are
(the dashboard agent-dock composers and the main chat composer), SHALL be an
Advanced-mode capability, and the popup SHALL portal to the document body so a small
dock window does not shrink it. The button SHALL indicate when one or more clauses
are currently active, so the operator can tell at a glance that sends are being
amended.

#### Scenario: Open the popup from a dock

- **WHEN** the operator clicks the footer-clauses button in an agent-dock composer
- **THEN** the footer-clauses popup opens full-size above the dashboard, not clipped to the dock

#### Scenario: Active state is visible on the button

- **WHEN** at least one clause is active
- **THEN** the composer button renders visually distinct (e.g. highlighted / badged) from the all-inactive state

### Requirement: Manage a persistent clause list

The footer-clauses popup SHALL present a list of clauses where the operator can add
a new clause (free text), edit an existing clause's text, delete a clause, and
toggle each clause active or inactive via a per-clause checkbox. The list — texts
and active flags — SHALL be persisted in a global backend store (the custom-prompts
store pattern) so it survives harness restarts and is shared across devices;
deactivating a clause SHALL keep it in the list for later re-activation.

#### Scenario: Add and activate a clause

- **WHEN** the operator adds a clause ("run long-lived processes detached — you are invoked via claude -p, so children die when your turn ends") and ticks its checkbox
- **THEN** the clause appears in the list as active, and reopening the popup later — including from another device — shows the same clause still active

#### Scenario: Deactivate without deleting

- **WHEN** the operator unticks an active clause's checkbox
- **THEN** the clause stays in the list, shown inactive, and is no longer appended to sends

#### Scenario: Edit and delete

- **WHEN** the operator edits a clause's text or deletes a clause
- **THEN** the change persists, and subsequent sends use the edited text (or omit the deleted clause)

### Requirement: Active clauses ride along as a prompt footer

Every prompt sent from the composer SHALL have the currently active clauses appended
as a clearly delimited footer after the operator's typed message, in list order, so
standing instructions reach the agent on every turn without retyping. This applies
to all composer-originated sends (typed sends and approved queue chips). Sends with
no active clause SHALL go out exactly as typed. Autopilot-loop engine sends are out
of scope — they keep their own briefing mechanism.

#### Scenario: Footer appended on send

- **WHEN** two clauses are active and the operator sends "fix the failing test"
- **THEN** the prompt delivered to the agent is the typed message followed by a delimited footer containing both clauses in list order

#### Scenario: No active clauses, no footer

- **WHEN** every clause is inactive (or the list is empty) and the operator sends a message
- **THEN** the delivered prompt is exactly the typed message, with no footer

#### Scenario: Every turn, until deactivated

- **WHEN** a clause stays active across three consecutive sends
- **THEN** each of the three delivered prompts carries the footer, and after the operator deactivates the clause the next send carries none

