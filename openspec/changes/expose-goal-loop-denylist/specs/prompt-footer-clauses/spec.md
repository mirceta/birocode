# prompt-footer-clauses

## MODIFIED Requirements

### Requirement: Active clauses ride along as a prompt footer

Every prompt sent from the composer SHALL have the currently active clauses appended
as a clearly delimited footer after the operator's typed message, in list order, so
standing instructions reach the agent on every turn without retyping. This applies
to all composer-originated sends (typed sends and approved queue chips). Sends with
no active clause SHALL go out exactly as typed. Autopilot-loop engine sends carry
the footer only when the armed loop instance has opted in via its
include-footer-clauses setting (see the autopilot-loops capability); a loop without
that opt-in keeps its briefing-only sends unchanged.

#### Scenario: Footer appended on send

- **WHEN** two clauses are active and the operator sends "fix the failing test"
- **THEN** the prompt delivered to the agent is the typed message followed by a delimited footer containing both clauses in list order

#### Scenario: No active clauses, no footer

- **WHEN** every clause is inactive (or the list is empty) and the operator sends a message
- **THEN** the delivered prompt is exactly the typed message, with no footer

#### Scenario: Every turn, until deactivated

- **WHEN** a clause stays active across three consecutive sends
- **THEN** each of the three delivered prompts carries the footer, and after the operator deactivates the clause the next send carries none

#### Scenario: Loop sends follow the loop's opt-in

- **WHEN** clauses are active and a driven loop without the include-footer-clauses opt-in sends a work prompt
- **THEN** that send carries no footer, while an opted-in loop's work send does
