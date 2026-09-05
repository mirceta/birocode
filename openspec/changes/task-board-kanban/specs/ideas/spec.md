## ADDED Requirements

### Requirement: Kanban view of the task board

The Ideas surface SHALL offer a Kanban tab that shows the task graph's nodes as the
columns Backlog (todo, unassigned), Assigned (todo with an assignee), In progress
(doing) and Done, with assignment to any repo agent on any fleet machine and a way to
ping the assignee.

#### Scenario: Assigning and pinging

- **WHEN** the operator assigns a Backlog card to a repo agent and presses Ping
- **THEN** the task brief is sent to that agent's conversation through the arch send
  path, and the card moves to In progress showing when it was pinged

#### Scenario: Blocked tasks

- **WHEN** a card has a prerequisite that is not done
- **THEN** it shows as blocked and cannot be pinged until the prerequisite is done

#### Scenario: Promoting an idea

- **WHEN** an active idea is sent to the graph
- **THEN** the task remembers the idea it came from and the idea leaves the Active section
