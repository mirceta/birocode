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

