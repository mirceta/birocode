## ADDED Requirements

### Requirement: A card carries the policeman's observation as an Agent section
A task card SHALL be able to carry one observation — when, by whom, a state from the fixed
vocabulary, a one-sentence summary and the policeman session id — exposed on the board
API and on list_tasks. The Kanban card SHALL render it as a labeled Agent section beneath
the Board check, naming its source and time and session, with a dismiss control; the
states asked-question, blocked and errored SHALL be drawn as needing attention.

#### Scenario: The Agent section
- **WHEN** a card carries an observation by the policeman with state waiting-review
- **THEN** the card shows "AGENT 👀 Waiting for review — <summary> — seen by the policeman, N min ago · session <id>" and a ✕ that calls DELETE /api/taskgraph/nodes/{id}/observation
