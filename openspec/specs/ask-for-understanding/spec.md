# ask-for-understanding Specification

## Purpose
TBD - created by archiving change add-ask-for-understanding. Update Purpose after archive.
## Requirements
### Requirement: Trigger an understanding run from the agent dock

The system SHALL render an **"Ask for understanding"** control in the agent dock, next to the
Discover-local-apps control, that on activation starts an agentic run for THIS dock's repo and
conversation. The control SHALL be gated on a UI-mode capability that defaults to Advanced. The
control SHALL be enabled only when the dock's builder lane has an active conversation (a session
id); when there is none it SHALL be disabled with a hint to start a conversation first, rather
than failing on activation.

#### Scenario: Button visible in Advanced, hidden in Basic

- **WHEN** the dock is shown with the understanding capability at its Advanced default
- **THEN** the "Ask for understanding" control appears next to the Discover control in Advanced mode and is absent in Basic mode

#### Scenario: Disabled with no conversation

- **WHEN** the dock's builder lane has no session id yet
- **THEN** the control is disabled with a hint to start a conversation first, and activating it starts no run

#### Scenario: Activation starts a run

- **WHEN** the user activates the control on a dock whose builder lane has a conversation
- **THEN** the system starts an understanding run scoped to that dock's repo and that conversation

### Requirement: Fork the current conversation at press time, not the live session

The system SHALL continue the dock conversation by forking a copy of its transcript taken at
activation time and running the new turn on the fork, so the user's live session is never
resumed, interleaved, or blocked. The system SHALL locate the conversation's transcript from the
repo path and the builder session id, and SHALL continue it through the reused Claude Monitor
client's snapshot-resume mechanism (a fresh session created from a copy of the transcript). The
run's working directory SHALL be the repo root.

#### Scenario: Live conversation is untouched

- **WHEN** an understanding run is started for a dock conversation
- **THEN** the user's live session for that conversation is not resumed or modified, and the user can keep chatting in it concurrently

#### Scenario: Fork captures the conversation as it stands

- **WHEN** the run is started
- **THEN** the forked turn continues from the conversation exactly as it was at activation time, including the most recent assistant turn

#### Scenario: No transcript available

- **WHEN** the conversation's transcript cannot be located for the given repo and session id
- **THEN** the run fails with a friendly error rather than starting an empty or unrelated session

### Requirement: The forked agent builds the repo's Understanding app for the latest turn

The continuation prompt SHALL instruct the forked agent to follow the Understanding-app
convention (`docs/understanding-app-convention.md`) and to author the repo's Understanding app
(`understanding-app/index.html` at the repo root, build-less, self-contained, relative-URL only)
so that it visually clarifies the most recent assistant turn of the conversation with demos,
diagrams, and a thorough visual explanation. Because the working directory is the repo root, the
output SHALL land where the Local tab's always-on Understanding app serves it.

Because the convention document lives only in the canonical Harness repo (birocode) yet the run
can fire from any repo, the system SHALL resolve the convention document's location and pass it
into the prompt rather than assuming it exists in the firing repo. The system SHALL resolve it by
walking the firing repo's ancestor directories up to the nearest one named `playground` and
descending into `birocode/docs/understanding-app-convention.md` (birocode being a direct child of
`playground`), passing that absolute path into the prompt. When no such document can be resolved,
the system SHALL fall back to referencing the convention relative to the firing repo. The prompt
SHALL direct the agent to build the Understanding app in the firing repo (the working directory),
not where the convention document lives.

#### Scenario: Understanding app is produced for the latest turn

- **WHEN** an understanding run completes successfully
- **THEN** `understanding-app/index.html` at the repo root is written/overwritten to visually explain the conversation's most recent assistant turn

#### Scenario: Convention pointer resolves across repos

- **WHEN** the run fires from a repo other than birocode that shares a `playground` ancestor with birocode
- **THEN** the prompt references the convention document at birocode's absolute path under that `playground` ancestor, and instructs the agent to build the app in the firing repo

#### Scenario: Output is servable by the Local tab

- **WHEN** the run writes the Understanding app
- **THEN** it is written under the repo root following the convention (relative URLs, self-contained), so the Local tab's Understanding app renders it on reload

### Requirement: The run is backend-owned, latest-only, and survives disconnect

The system SHALL run the understanding job on the backend with its own cancellation scope so a
browser refresh or disconnect mid-run neither cancels the run nor loses its result. Per repo the
system SHALL keep at most the latest run: a start request while a run is in progress SHALL join
the running one, and a start request after a terminal run SHALL replace it with a fresh run. The
system SHALL expose a start-or-join action and a reattach-only status action (the status action
SHALL never start a run), both scoped to the requesting repo.

#### Scenario: Refresh mid-run does not cancel it

- **WHEN** the user starts an understanding run and then reloads the page before it finishes
- **THEN** the run continues on the backend and the dock reattaches to its in-progress state via the status action

#### Scenario: Start while running joins, not duplicates

- **WHEN** a run is already in progress for a repo and another start request arrives for it
- **THEN** the system joins the in-progress run rather than starting a second concurrent run

#### Scenario: Status never starts a run

- **WHEN** the status action is called for a repo with no run in progress
- **THEN** it reports the latest known state (idle or the last terminal result) without starting a new run

### Requirement: Report progress in the per-repo Console

The system SHALL emit the understanding run's lifecycle as per-repo events (a started event when
the run is invoked, and a terminal done or error event) carrying a human-readable title and
detail, into the same per-repo event log the Console lane renders, so the user can follow the run
in the Console alongside discovery and run events.

#### Scenario: Lifecycle appears in the Console

- **WHEN** an understanding run starts and later finishes
- **THEN** the Console lane for that repo shows a started event and a matching done event for the run

#### Scenario: Failure is reported, not silent

- **WHEN** the run fails (for example the Claude Monitor gateway is not running, or no transcript is available)
- **THEN** the Console lane shows an error event with a friendly detail, and the run ends in an error state rather than failing silently

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

