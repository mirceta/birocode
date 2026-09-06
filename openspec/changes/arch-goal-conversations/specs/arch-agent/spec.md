## ADDED Requirements

### Requirement: A goal conversation is the arch agent on a timer

The harness SHALL let a goal be started as its own arch conversation — from the Arch
tab's Loops lane or through the `start_arch_goal(goal, repos, tasks, maxIterations)`
tool on the Operator's ask — that runs the goal loop kind (capped) and drives the named
managed repo agents (this machine or a fleet source) and board tasks, a task's assignee
included, from the start until the goal ends. The loop SHALL re-send the goal every poll
interval (the conversation's quiet floor); a goal conversation SHALL NOT be woken by a
repo agent's turn, a loop event or a board change — it checks its agents itself with its
tools on each turn. Repo agents SHALL stay passive: they answer when asked and never call
the arch. An agent or task SHALL be driven by at most one running goal. What a goal drives
SHALL be shown on the Arch tab (conversation header and Loops lane), the Management App
tab strip, the Status tab's Goal conversations card, the fleet status chips and the agent
docks ("driven by arch goal <id>"). `list_arch_goals` SHALL expose id, goal, owner
conversation, driven repos and tasks, state, iterations, poll interval, last poll and
queued messages; `stop_arch_goal(id)` SHALL stop one.

#### Scenario: A goal drives what it names and polls on its own clock

- **WHEN** the Operator starts a goal on `spacex/prg` and board task T assigned to `spacex/fluent`, and prg then finishes a turn
- **THEN** a new conversation named after the goal runs a goal loop, drives prg, fluent and T, the fleet chips of prg and fluent say "driven by arch goal <id>", prg's finish wakes nothing, and the goal's next poll goes out when its floor elapses

#### Scenario: One running goal per agent

- **WHEN** a second goal names prg while the first still runs
- **THEN** it is refused as owned, naming the first goal

### Requirement: The Operator-facing conversation is a plain chat

The default conversation SHALL receive no repo wake-ups and no turns of its own except a
finished goal's summary; it SHALL be able to list goal conversations, read their status
and transcripts, and start and stop them.

#### Scenario: Talking to the arch while a goal runs

- **WHEN** a goal conversation is busy and the Operator writes to the default conversation
- **THEN** the message is answered as a normal turn and nothing from the goal's agents interrupts it

### Requirement: A goal conversation is busy while its goal runs

A conversation SHALL be reported `busy: goal <id>` while its goal runs and its loop is
armed. Opening a busy conversation SHALL show a banner naming the goal, what it drives
and its poll; the composer SHALL queue the text as an Operator message carried at the top
of the loop's next poll instead of sending a turn, and SHALL offer to start a new goal
conversation. A loop stopped from the Loops lane or the dock SHALL end the goal
(reconciled on the next tick).

#### Scenario: Message a busy goal

- **WHEN** the Operator types into a busy goal conversation
- **THEN** the message is queued, the goal shows one queued message, and the next poll of that conversation carries it ahead of the goal prompt

### Requirement: Goal completion releases the agents and is summarised to the Operator

A goal SHALL end when its loop resolves — the arch's `LOOP_DONE` confirmed by its one
verification turn (`GOAL_VERIFIED`), the Operator's stop, the cap or an error; a
`NEEDS_HUMAN` reply SHALL hold the conversation busy with the question shown. On end the
conversation SHALL release the agents and tasks it drove and become available, and one
summary message (goal, outcome, driven agents, task statuses, the conversation's last
reply) SHALL be posted to the Operator-facing conversation with actor `goal` once its
slot is free.

#### Scenario: Completion releases and summarises

- **WHEN** the goal loop resolves done
- **THEN** the goal is `done`, prg and T are driven by nobody, the conversation is not busy, and the default conversation receives one `goal` message summarising it
