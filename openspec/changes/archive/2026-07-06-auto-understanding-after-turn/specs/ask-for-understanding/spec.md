# Delta for ask-for-understanding (auto-understanding-after-turn)

## ADDED Requirements

### Requirement: Automatic understanding run at the end of a turn

The system SHALL automatically start an understanding run — identical in behavior to manual
activation — when a builder-lane chat run for a repo completes, provided ALL of the following
hold: the run's terminal status is done (not error, stopped, or crashed), the run captured a
conversation session id, and the repo's auto-understanding setting is enabled. The trigger SHALL
observe run completion at a single backend choke point so every way of starting a chat run
(user send, autopilot, loops) is covered, and it SHALL fire without any client attached. The
trigger SHALL NOT fire for non-builder lanes, and an understanding run SHALL never trigger
another understanding run. A trigger failure SHALL never fail or delay the chat turn's
completion.

#### Scenario: Turn done with auto enabled starts a run

- **WHEN** a builder-lane chat run completes as done with a session id, and the repo's
  auto-understanding setting is enabled
- **THEN** the system starts an understanding run for that repo and that session, equivalent to
  the user pressing "Ask for understanding" at that moment

#### Scenario: Disabled repo stays manual

- **WHEN** a builder-lane chat run completes as done for a repo whose auto-understanding
  setting is off
- **THEN** no understanding run starts, and the manual control keeps working as before

#### Scenario: Failed or stopped turns do not trigger

- **WHEN** a chat run ends as error (stopped by the user, crashed, or is_error)
- **THEN** no understanding run starts

#### Scenario: No client attached

- **WHEN** a turn completes as done with auto enabled and no browser is connected (for example
  an autopilot loop turn overnight)
- **THEN** the understanding run still starts, and its lifecycle is observable afterwards via
  the status action and Console events

#### Scenario: Understanding runs never self-trigger

- **WHEN** an automatically started understanding run completes
- **THEN** it does not count as a chat turn and triggers no further understanding run

### Requirement: Per-repo auto-understanding setting

The system SHALL keep a per-repo auto-understanding setting, persisted server-side so it
survives harness restarts and applies with no client attached. The setting SHALL default to
off, including for repos that predate the setting. The system SHALL expose repo-scoped actions
to read and change the setting. The agent dock SHALL render a control to view and flip the
setting next to the existing "Ask for understanding" control, gated by the same UI-mode
capability (Advanced by default), reflecting the persisted value on load and repo change.

#### Scenario: Default is off

- **WHEN** a repo has never had its auto-understanding setting changed (including repos created
  before the setting existed)
- **THEN** the setting reads as off and no automatic runs fire for it

#### Scenario: Toggle persists across restart

- **WHEN** the user enables auto-understanding for a repo and the harness restarts
- **THEN** the setting still reads enabled and automatic runs keep firing for that repo

#### Scenario: Dock control gated like the button

- **WHEN** the dock renders with the understanding capability at its Advanced default
- **THEN** the auto toggle appears next to the "Ask for understanding" control in Advanced mode,
  absent in Basic mode, and shows the repo's persisted value

### Requirement: Coalesce turns that finish during a run

The system SHALL coalesce qualifying turns that complete while the repo's understanding run is
still in flight: it SHALL remember the newest such session as the repo's single pending
automatic run, replacing any previously pending one, and SHALL start it once the in-flight run
reaches a terminal state.
Intermediate turns SHALL be dropped rather than queued. Manual start-or-join and reattach
semantics SHALL be unchanged.

#### Scenario: Turn during a run re-fires once for the newest

- **WHEN** an understanding run is in flight for a repo and two more turns complete as done
  with auto enabled before it finishes
- **THEN** exactly one follow-up understanding run starts after the in-flight one ends, for the
  newest of the two sessions

#### Scenario: No pending run means no follow-up

- **WHEN** an understanding run finishes and no qualifying turn completed while it ran
- **THEN** no follow-up run starts
