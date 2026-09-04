## MODIFIED Requirements

### Requirement: User bubbles carry the sending actor
Every user message emitted into a repo's conversation SHALL carry an `actor` value
identifying who sent it: `human` for Operator and End User sends (implied when
absent), `loop` for autopilot loop sends, `arch` for local arch agent sends, and
`arch@<machine>` for tasks received from a fleet arch on another harness. The dock
and chat surfaces SHALL render a visible tag for any non-human actor on the bubble,
styling `arch@<machine>` like `arch`.

#### Scenario: Fleet send is tagged with its machine
- **WHEN** a fleet arch on machine A sends a task to a repo on this harness
- **THEN** the bubble shows the tag `arch@A` in the arch style
