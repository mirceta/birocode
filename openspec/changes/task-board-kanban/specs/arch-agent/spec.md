## ADDED Requirements

### Requirement: Task board tools

The arch agent SHALL read and write the fleet task board through its tools —
list_tasks, create_task, update_task, assign_task, dispatch_task, list_ideas,
idea_to_task — and SHALL dispatch every task that is assigned, not yet pinged and not
blocked on each wake.

#### Scenario: Dispatching an awaiting task

- **WHEN** the board holds a task assigned to a repo agent that has not been pinged and
  whose prerequisites are done
- **THEN** the arch's dispatch_task sends the task brief to that agent under the same
  rules as send_task, the card moves to doing, and the task is not dispatched again
  unless the transcript shows the agent never picked it up

#### Scenario: Closing a task

- **WHEN** a repo agent's reply ends with "TASK DONE <id>" or "TASK BLOCKED <id>: <why>"
- **THEN** the arch moves the card to done, or back to todo with the reason in its note
