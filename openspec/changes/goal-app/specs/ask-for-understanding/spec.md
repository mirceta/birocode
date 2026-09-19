## MODIFIED Requirements

### Requirement: The run is backend-owned, latest-only, and survives disconnect

The system SHALL run conversation-app builds on the backend with their own cancellation
scope so a browser refresh or disconnect mid-run neither cancels the run nor loses its
result. The registry SHALL be keyed by **kind and repo** (kinds: `understanding`, `goal`):
per (kind, repo) the system SHALL keep at most the latest run — a start request while a
run is in progress SHALL join the running one, and a start request after a terminal run
SHALL replace it with a fresh run. Runs of different kinds for one repo SHALL be
independent and MAY run concurrently. The system SHALL expose, per kind, a start-or-join
action and a reattach-only status action (the status action SHALL never start a run),
both scoped to the requesting repo.

#### Scenario: Refresh mid-run does not cancel it

- **WHEN** the user starts an understanding run and then reloads the page before it finishes
- **THEN** the run continues on the backend and the dock reattaches to its in-progress state via the status action

#### Scenario: Start while running joins, not duplicates

- **WHEN** a run of a kind is already in progress for a repo and another start request of that kind arrives for it
- **THEN** the system joins the in-progress run rather than starting a second concurrent run

#### Scenario: Status never starts a run

- **WHEN** the status action is called for a repo with no run in progress
- **THEN** it reports the latest known state (idle or the last terminal result) without starting a new run

#### Scenario: Kinds do not block each other

- **WHEN** an understanding run is in progress for a repo and a goal start request arrives
- **THEN** the goal run starts alongside it

### Requirement: Automatic understanding run at the end of a turn

The system SHALL automatically start a conversation-app build — identical in behavior to
manual activation — when a builder-lane chat run for a repo completes, provided ALL of
the following hold: the run's terminal status is done (not error, stopped, or crashed),
the run captured a conversation session id, and the repo's auto setting **for that
kind** is enabled (`AutoUnderstanding` for the understanding run, `AutoGoal` for the goal
run; each kind is started independently). The trigger SHALL observe run completion at a
single backend choke point so every way of starting a chat run (user send, autopilot,
loops) is covered, and it SHALL fire without any client attached. The trigger SHALL NOT
fire for non-builder lanes, and a build SHALL never trigger another build. A trigger
failure SHALL never fail or delay the chat turn's completion.

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
- **THEN** no build of any kind starts

#### Scenario: No client attached

- **WHEN** a turn completes as done with auto enabled and no browser is connected (for example
  an autopilot loop turn overnight)
- **THEN** the build still starts, and its lifecycle is observable afterwards via
  the status action and Console events

#### Scenario: Builds never self-trigger

- **WHEN** an automatically started build completes
- **THEN** it does not count as a chat turn and triggers no further build

#### Scenario: Each kind by its own flag

- **WHEN** a builder turn completes as done for a repo with `AutoGoal` on and
  `AutoUnderstanding` off
- **THEN** only a goal run starts
