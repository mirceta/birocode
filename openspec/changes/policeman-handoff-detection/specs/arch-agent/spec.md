## ADDED Requirements

### Requirement: A pending handoff is the arch's cue to create the follow-up task
`list_tasks` SHALL carry, per task, `observation.target` and `observation.followUpId`. The
arch's role prompt SHALL tell it that a card whose `observation.state` is `handoff` with no
`followUpId` ended in a handoff — the agent's last turns call for a NEW task on ANOTHER agent
or repo — and that it SHALL create that follow-up task (`create_task`, assigned to the named
agent when the words name one, its note quoting the handoff summary and the source card's
#ref), after which the policeman links it and stops asking. The repo agent's `my_effort` SHALL
carry the same two fields on its observation.

#### Scenario: The arch wakes to a handoff
- **WHEN** `list_tasks` shows a card with `observation.state: "handoff"`, `target: "prg"` and `followUpId: null`
- **THEN** the arch creates a task for prg whose note quotes the handoff and the source #ref, and on the policeman's next pass that card's `followUpId` names the new task
