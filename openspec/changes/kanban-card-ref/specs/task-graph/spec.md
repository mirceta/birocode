## ADDED Requirements

### Requirement: Every card carries a short stable reference that resolves to the exact task
Every Kanban card SHALL show a short reference, `#` followed by the first 8 characters
of the task id, which SHALL be stable for the life of the card. A copy button on the
card (and in its detail view) SHALL put `task <full id>` on the clipboard, SHALL show
"copied" feedback, and SHALL NOT open the card or start a drag. The board's task
routes and the arch's task tools SHALL resolve a reference given as the full id,
`#<short>`, `task <id>` or a unique prefix of at least 6 characters to that exact task,
and SHALL refuse an ambiguous prefix naming the candidates. `list_tasks` SHALL return
the reference beside the id.

#### Scenario: Paste into the arch prompt
- **WHEN** the Operator copies a card's reference and pastes it into the arch conversation
- **THEN** the arch's `update_task`, `assign_task` and `dispatch_task` act on exactly that card

#### Scenario: A typed short code
- **WHEN** the arch calls `update_task` with id `#5cc3e900` and one card starts with that prefix
- **THEN** that card is updated; with two such cards the call is refused and both are named
