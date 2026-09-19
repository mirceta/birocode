## ADDED Requirements

### Requirement: Recurring tasks are cards bound to one repo agent

The Harness SHALL keep a list of recurring tasks, persisted locally with atomic writes and
independent of the task board. A recurring task SHALL carry a title, one assigned repo
agent addressed by machine and repo id (this harness or a fleet peer), instructions, a
schedule, a run mode with a turn budget, an enabled flag and its run counters. Any number
of recurring tasks MAY be assigned to the same repo agent. A recurring task SHALL be
created, edited, paused, resumed and deleted only by explicit Operator action.

#### Scenario: Two schedules on one agent

- **WHEN** the Operator creates "CI health check" every 2 h and "Morning drift report"
  daily at 07:00, both assigned to the same repo agent
- **THEN** both cards exist and run on their own schedules, one after the other when their
  times collide

### Requirement: Occurrences sit on a fixed grid and missed ones coalesce

The schedule SHALL be either an interval (every N minutes, 5 minutes to 30 days, counted
from the task's anchor) or a daily time on chosen weekdays in the harness's local time.
Occurrences SHALL sit on a fixed grid: a late or long run SHALL NOT shift later
occurrences, and creating a task SHALL NOT fire it. When several occurrences have passed
unhandled, the Harness SHALL run the task once, for the newest of them, recording how many
earlier occurrences it covers and the trigger `catch-up`; with catch-up turned off for the
task, an occurrence that cannot start within 10 minutes of its time SHALL be recorded as
skipped instead.

#### Scenario: The harness was down overnight

- **WHEN** an hourly task's harness is off from 01:30 to 06:20
- **THEN** one run fires after 06:20 for the 06:00 occurrence, recorded as catch-up
  covering 4 earlier occurrences, and the next run is due at 07:00

### Requirement: A scheduled run is a goal loop armed on the assignee

A due occurrence SHALL arm the harness's existing goal loop on the assigned repo agent —
through the same arming path the dock's loop panel uses, over the fleet's peer loop API for
a peer's agent — in drive mode, attributed to `recurring`, capped at the task's turn
budget, with the task's instructions as the goal. The goal loop's own rules SHALL apply
unchanged: the work prompt is sent until the agent ends a reply with `LOOP_DONE`, a
verification prompt follows, only `GOAL_VERIFIED` completes the run, gaps send it back to
work, and `NEEDS_HUMAN:` escalates. The goal text SHALL tell the agent the previous run's
outcome and SHALL ask for one result line — `RUN OK: …` or `RUN ATTENTION: …` — directly
above `GOAL_VERIFIED`. A task MAY instead be set to `single` mode, which sends the
instructions once with a closing-line contract.

#### Scenario: The agent declares done too early

- **WHEN** a run's agent ends its first reply with `LOOP_DONE` but the verification turn
  finds the report was written without running the checks
- **THEN** the loop returns to work, the agent runs the checks, a second verification ends
  with `GOAL_VERIFIED`, and the run is recorded as verified in 4 turns

### Requirement: A scheduled run never queues, pre-empts or bypasses the Operator's gate

While the Operator's autopilot gate is closed nothing SHALL be armed and the pending
occurrence SHALL be held. While the assignee's builder run slot is busy, or its loop slot
is in use by any other loop (the Operator's, the arch's or another recurring task's run),
the occurrence SHALL stay pending in the scheduler and be attempted again later; nothing
SHALL be queued or stashed in the agent and no running turn or loop SHALL be stopped. With
"skip when busy" set on the task the occurrence SHALL be recorded as skipped instead. The
loop parameters the agent's slot held before the run SHALL be restored when the run
resolves. An arm the path refuses (unmanaged, peer unreachable, not accepting sends) SHALL
be recorded as a refused run with the named reason.

#### Scenario: The Operator's own loop is running

- **WHEN** a task is due at 14:00 while the Operator's goal loop drives the same agent until 14:40
- **THEN** the card shows it is held because the agent's loop slot is in use, the run is
  armed on the first tick after the Operator's loop resolves, and afterwards the dock's
  loop panel shows the Operator's loop parameters again

#### Scenario: Gate closed

- **WHEN** the Operator's autopilot gate is closed at the scheduled time
- **THEN** nothing is armed, the card says the gate is holding it, and one catch-up run
  fires after the gate opens

### Requirement: Every occurrence leaves a run record whose outcome is the loop's resolution

Every fired, skipped or refused occurrence SHALL append a run record: due time, trigger
(schedule, catch-up or manual), the loop's status and stop reason, the number of turns,
start and end times, duration, the session it ran in, and the reason when it was not
armed. The Harness SHALL derive the outcome without involving a model: a verified run takes
the outcome and one-line summary of its result line (ok when there is none); a run that
escalated with `NEEDS_HUMAN:` is `attention` with the agent's question; a run that reached
its turn budget, errored, or was stopped by the Operator is `failed`. While a run is in
progress its record SHALL show the loop's phase and turn count. A run whose loop survives a
harness restart SHALL continue and be re-attached to its record.

#### Scenario: A check that found something

- **WHEN** the verification reply ends with `RUN ATTENTION: 2 of the last 10 runs on main failed`
  followed by `GOAL_VERIFIED`
- **THEN** the run is recorded verified with outcome attention and that summary, and the
  card and the tab show it needs attention

#### Scenario: The agent needs a decision

- **WHEN** a run's agent replies `NEEDS_HUMAN: origin/main was force-pushed — reset or keep local commits?`
- **THEN** the run is recorded escalated with outcome attention and that question as its summary

### Requirement: A task that keeps failing pauses itself

After 3 consecutive runs that failed or were refused, the Harness SHALL pause the task,
record why, and mark it as needing attention; a run that escalated SHALL NOT count as a
failure. Resuming SHALL be an Operator action and SHALL re-anchor the schedule. A run SHALL
be skipped, and recorded as such, while the assignee account's 5-hour plan usage is above
the task's threshold.

#### Scenario: The peer is gone

- **WHEN** three consecutive arms on a peer's agent are refused as unreachable
- **THEN** the task is paused with the reason "3 consecutive failures", no further arms
  are attempted, and the card shows it
