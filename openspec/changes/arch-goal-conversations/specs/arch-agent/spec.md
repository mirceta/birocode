## ADDED Requirements

### Requirement: Goal-scoped arch conversations own repos and tasks

The harness SHALL let a goal be started as its own arch conversation — from the Arch
tab's Loops lane or through the `start_arch_goal(goal, repos, tasks, maxIterations,
requireMerged)` tool on the Operator's ask — that runs the goal loop kind with the arch's
pacing and cap and OWNS the named managed repo agents (this machine or a fleet source)
and board tasks, a task's assignee included, from the start until the goal ends. A repo
or task SHALL belong to at most one running goal. Ownership SHALL be shown on the Arch
tab (conversation header and Loops lane), the Management App tab strip, the Status tab's
Goal conversations card, the fleet status chips and the agent docks ("driven by arch goal
<id>"). `list_arch_goals` SHALL expose id, goal, owner conversation, owned repos and
tasks, state, iterations, last wake and queued messages; `stop_arch_goal(id)` SHALL stop
one.

#### Scenario: A goal owns what it names

- **WHEN** the Operator starts a goal on `spacex/prg` and board task T assigned to `spacex/fluent`
- **THEN** a new conversation named after the goal runs a goal loop, owns prg, fluent and T, the fleet chips of prg and fluent say "driven by arch goal <id>", and starting another goal on prg is refused as owned

### Requirement: Repo events route to the owning conversation and never to the default conversation

The harness SHALL wake, for a repo turn (`turn.start` / `turn.ended`), a loop event or a
task status change (`task.status`, published by the task board), ONLY the goal
conversation that owns that repo (or the task, or the task's assignee), as an early wake
inside its own pacing. The default conversation SHALL receive no repo wake-ups. Events no running goal
owns SHALL be kept in an arch inbox shown on the Status tab, and SHALL never become a
turn in any conversation. A setting **legacy broadcast** (default off) SHALL restore the
previous behaviour for goal-less conversations: woken by every managed repo event.

#### Scenario: Owned and unowned events

- **WHEN** prg (owned by goal G) and other (owned by nobody) both end a turn
- **THEN** G's conversation is woken naming prg only, the default conversation is not woken, and other's turn appears in the inbox

#### Scenario: Legacy broadcast

- **WHEN** the Operator turns legacy broadcast on and arms the default conversation's standing wake loop
- **THEN** the default conversation is woken by every managed repo turn as before goals

### Requirement: A goal conversation is busy while its goal runs

A conversation SHALL be reported `busy: goal <id>` while its goal runs and its loop is
armed. Opening a busy conversation SHALL show a banner naming the goal and what it owns;
the composer SHALL queue the text as an Operator message read on the loop's next wake
instead of sending a turn, and SHALL offer to start a new goal conversation. A loop
stopped from the Loops lane or the dock SHALL end the goal (reconciled on the next tick).

#### Scenario: Message a busy goal

- **WHEN** the Operator types into a busy goal conversation
- **THEN** the message is queued, the goal shows one queued message, and the next send of that conversation carries it ahead of the loop prompt

### Requirement: Goal completion is verified against the board and summarised to the Operator

A goal SHALL end as done only when its verification turn passes AND every owned board
task is at least `pr-opened` (`pr-merged` when the goal requires the merge) in the kanban
lifecycle order `todo < assigned < doing < pr-opened < pr-merged < done`; a done the
board refuses SHALL send the conversation back to work with the gap named. When the goal
ends (done, stopped, capped or error) the conversation SHALL release its repos and tasks
and become available, and one summary message (goal, outcome, owned repos, task statuses,
the conversation's last reply) SHALL be posted to the Operator-facing conversation with
actor `goal` once its slot is free.

#### Scenario: Board refuses a done

- **WHEN** the goal conversation's verification says GOAL_VERIFIED while owned task T is still `doing`
- **THEN** the loop re-sends the work prompt at once, prefixed with the board check naming T, and the goal stays running

#### Scenario: Completion releases and summarises

- **WHEN** the goal loop resolves done with every owned task done
- **THEN** the goal is `done`, prg and T are owned by nobody, the conversation is not busy, and the default conversation receives one `goal` message summarising it
