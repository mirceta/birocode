## ADDED Requirements

### Requirement: The Kanban paints on the board's own data

The Kanban SHALL render its cards as soon as the task board (`GET /api/taskgraph`) answers, and
SHALL NOT wait for the fleet status or the ideas list; machine labels and idea numbers SHALL
fill in when their own calls answer. A client poll SHALL join an identical in-flight GET only
while that request is younger than four seconds, so a request that hangs cannot capture every
later poll of the same address.

#### Scenario: The fleet status is slow

- **WHEN** the task board answers in 40 ms and the fleet status takes five seconds
- **THEN** the cards are on screen after the board's answer, and the machine labels appear when
  the fleet status arrives

#### Scenario: A request hangs

- **WHEN** one fleet-status request never answers
- **THEN** the poll five seconds later sends its own request instead of waiting on the first
