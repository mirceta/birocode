## ADDED Requirements

### Requirement: Recurring tasks are cards bound to one repo agent

The Harness SHALL keep a list of recurring tasks, persisted locally with atomic writes and
independent of the task board and of the per-agent loop slot. A recurring task SHALL carry
a title, one assigned repo agent addressed by machine and repo id (this harness or a fleet
peer), instructions, a schedule, an enabled flag and its run counters. Any number of
recurring tasks MAY be assigned to the same repo agent. A recurring task SHALL be created,
edited, paused, resumed and deleted only by explicit Operator action.

#### Scenario: Two schedules on one agent

- **WHEN** the Operator creates "CI health check" every 2 h and "Morning drift report"
  daily at 07:00, both assigned to the same repo agent
- **THEN** both cards exist and run on their own schedules, and the agent's loop slot is
  untouched

### Requirement: Occurrences sit on a fixed grid and missed ones coalesce

The schedule SHALL be either an interval (every N minutes, 5 minutes to 30 days, counted
from the task's anchor) or a daily time on chosen weekdays in the harness's local time.
Occurrences SHALL sit on a fixed grid: a late or long run SHALL NOT shift later
occurrences, and creating a task SHALL NOT fire it. When several occurrences have passed
unhandled, the Harness SHALL run the task once, for the newest of them, recording how many
earlier occurrences it covers and the trigger `catch-up`; with catch-up turned off for the
task, an occurrence that cannot be sent within 10 minutes of its time SHALL be recorded as
skipped instead.

#### Scenario: The harness was down overnight

- **WHEN** an hourly task's harness is off from 01:30 to 06:20
- **THEN** one run fires after 06:20 for the 06:00 occurrence, recorded as catch-up
  covering 4 earlier occurrences, and the next run is due at 07:00

### Requirement: A scheduled send never queues, pre-empts or bypasses the Operator's gate

The Harness SHALL send a due occurrence through the same path an arch send uses — the
target's builder run slot locally, the fleet send posture and peer API for a peer — with
the provenance actor `recurring`. While the target's run slot is busy the occurrence SHALL
stay pending in the scheduler and be attempted again later; nothing SHALL be queued or
stashed in the agent and no running turn SHALL be stopped. With "skip when busy" set on the
task, a busy agent SHALL produce a skipped run instead. While the Operator's autopilot gate
is closed nothing SHALL be sent and the pending occurrence SHALL be held. While the
assignee has an active drive loop the occurrence SHALL be held by default. A send the path
refuses (unmanaged, peer unreachable, not accepting sends) SHALL be recorded as a refused
run with the named reason.

#### Scenario: Agent busy at the scheduled time

- **WHEN** a task is due at 14:00 and its agent's builder turn runs until 14:07
- **THEN** the card shows "due — waiting for the agent to be idle", the run is sent on the
  first tick after 14:07, and the 16:00 occurrence is still due at 16:00

#### Scenario: Gate closed

- **WHEN** the Operator's autopilot gate is closed at the scheduled time
- **THEN** nothing is sent, the card says the gate is holding it, and one catch-up run
  fires after the gate opens

### Requirement: Every occurrence leaves a run record with a machine-read outcome

Every fired, skipped or refused occurrence SHALL append a run record: due time, trigger
(schedule, catch-up or manual), status (running, done, error, stopped, skipped, refused),
sent and ended times, duration, the session it ran in, and the reason when it was not sent.
The send SHALL ask the agent to end with exactly one closing line — `RUN OK: …`,
`RUN ATTENTION: …` or `RUN FAILED: …` — and the Harness SHALL read the outcome and its
one-line summary from the final non-empty line of the reply without involving a model. A
finished run without such a line SHALL be recorded as `unreported` with the reply's last
line; an errored or Operator-stopped run SHALL be recorded as failed. A run left `running`
by a harness restart SHALL be closed as unreported at startup. The send SHALL tell the
agent the previous run's outcome.

#### Scenario: A check that found something

- **WHEN** the agent's reply ends with `RUN ATTENTION: 2 of the last 10 runs on main failed`
- **THEN** the run is recorded done with outcome attention and that summary, and the card
  and the tab show it needs attention

### Requirement: A task that keeps failing pauses itself

After 3 consecutive runs that failed or were refused, the Harness SHALL pause the task,
record why, and mark it as needing attention. Resuming SHALL be an Operator action and
SHALL re-anchor the schedule.

#### Scenario: The peer is gone

- **WHEN** three consecutive sends to a peer's agent are refused as unreachable
- **THEN** the task is paused with the reason "3 consecutive failures", no further sends
  are attempted, and the card shows it
