## ADDED Requirements

### Requirement: User bubbles carry the sending actor
Every user message emitted into a repo's conversation SHALL carry an `actor` value
identifying who sent it: `human` for Operator and End User sends (implied when
absent), `loop` for autopilot loop sends, and `arch` for arch agent sends. The dock
and chat surfaces SHALL render a visible tag for any non-human actor on the bubble,
in the same position a human message occupies, so provenance is readable in the
repo agent's own transcript.

#### Scenario: Arch send is tagged in the dock
- **WHEN** the arch agent sends a task to a repo
- **THEN** the repo's conversation shows a user bubble with an `arch` tag, and the repo agent's reply follows it as for any user message

#### Scenario: Human send has no tag
- **WHEN** the Operator sends from the composer
- **THEN** the bubble renders without an actor tag
