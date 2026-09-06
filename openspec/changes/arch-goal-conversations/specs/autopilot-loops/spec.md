## ADDED Requirements

### Requirement: A goal loop on an arch conversation is gated by the board and carries its wake

For a goal loop armed on an arch conversation that runs a goal, the engine SHALL apply
a completion gate: a `done` decision SHALL stand only when no owned board task is short
of the goal's lifecycle floor; otherwise the loop SHALL re-enter the work phase with the
work prompt. Each send of such a loop SHALL be prefixed with the queued Operator messages,
the board check (if any) and what happened on the owned repos and tasks since the last
turn, composed only when the run slot is free. The task board SHALL publish `task.status`
on the harness feed when a task's status changes, naming the task and its assignee.

#### Scenario: Gate and decoration

- **WHEN** the goal loop's verification reply ends with GOAL_VERIFIED and an owned task is `doing`
- **THEN** the loop proposes the work prompt in the work phase, and the send the agent receives starts with the board check naming that task
