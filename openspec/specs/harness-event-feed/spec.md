# harness-event-feed Specification

## Purpose
TBD - created by archiving change add-harness-event-feed. Update Purpose after archive.
## Requirements
### Requirement: Harness-scoped event feed with a typed, extensible envelope

The system SHALL maintain a single **harness-scoped** (not per-repository) append-only
feed of harness events. Each event SHALL carry a stable envelope: a sequence number
that is monotonically increasing across the whole harness for the lifetime of the
process, a timestamp, a `type` string identifying the kind of event, a `source`
identifying where in the harness the event originated (at least the repository it
pertains to, when applicable), and a `data` payload object whose shape is determined by
`type`. The envelope SHALL be the stable, general mechanism, and `type` SHALL be the
extension point: a new kind of event SHALL be expressible by introducing a new `type`
and its `data` shape, without changing the envelope or the read contract. The feed
SHALL be bounded: when it exceeds its retention cap the oldest events SHALL be dropped
while sequence numbers of remaining and future events stay monotonic. The feed MAY be
held in memory only and is not required to survive a process restart.

#### Scenario: Events are appended with harness-wide monotonic sequence numbers

- **WHEN** two harness events are published, even for different repositories
- **THEN** each event receives a sequence number strictly greater than the previously published event's, across the whole harness

#### Scenario: The feed is bounded

- **WHEN** the number of retained events exceeds the retention cap
- **THEN** the oldest events are dropped while newer events are retained, and sequence numbers continue to increase monotonically

#### Scenario: A new event type fits the existing envelope

- **WHEN** a future event of a new `type` is published
- **THEN** it appears in the feed with the same envelope fields (`seq`, `at`, `type`, `source`, `data`) and is readable by the same read contract, with no change required to existing readers' parsing of the envelope

### Requirement: Agent turn-ended event

The system SHALL publish a `turn.ended` event to the harness event feed when an agent
chat turn that the harness launched reaches its terminal state. The event's `data`
SHALL identify the repository and the session the turn belonged to, SHALL report the
terminal status (whether the turn completed successfully or ended in error), and SHALL
carry the `turnId` minted by the turn's `turn.start` event so the pair is matchable.
The event SHALL be published at the existing turn-end boundary the harness already
detects, and publishing it SHALL be best-effort: a failure to publish SHALL NOT
disrupt or alter the chat run. Publishing this event SHALL NOT require any additional
instrumentation of the agent gateway's internal steps.

#### Scenario: A successful turn publishes turn.ended

- **WHEN** an agent turn launched by the harness completes successfully
- **THEN** a `turn.ended` event is published whose `source` identifies the repository and whose `data` includes the session identifier, the turn's `turnId`, and a terminal status indicating success

### Requirement: Read-only event feed endpoint, paged by watermark

The system SHALL expose the harness event feed over a single read-only HTTP endpoint
that returns the events whose sequence number is greater than a caller-supplied
watermark, together with the current highest sequence number. A caller that supplies no
watermark (or one below the earliest retained event) SHALL receive the full retained
feed. This SHALL allow a client to poll incrementally, advancing its watermark, without
re-receiving events it has already seen. The endpoint SHALL be a read operation with no
side effects on harness state.

#### Scenario: Incremental read returns only newer events

- **WHEN** a client requests the feed with a watermark equal to the highest sequence it has already received
- **THEN** the response contains only events newer than that watermark, plus the current highest sequence number

#### Scenario: Fresh read returns the retained feed

- **WHEN** a client requests the feed with no watermark
- **THEN** the response contains the full retained feed

#### Scenario: Reading does not mutate harness state

- **WHEN** a client reads the feed any number of times
- **THEN** no harness action is triggered and no harness state is changed by the read

### Requirement: Feed reads are authenticated and expose no new actions

The harness event feed endpoint SHALL be protected by the harness's existing
authentication (a valid session cookie or the password header), the same as other
`/api/*` endpoints. This change SHALL NOT introduce any new endpoint that performs an
action or mutation, and SHALL NOT expose over REST any harness action that is not
already reachable from the frontend. The feed SHALL only report events; it SHALL NOT
provide a way to cause harness actions.

#### Scenario: Unauthenticated read is rejected

- **WHEN** a client without a valid session or password requests the event feed
- **THEN** the request is rejected by the existing authentication, as with other `/api/*` endpoints

#### Scenario: No action surface is added

- **WHEN** the change is reviewed for new endpoints
- **THEN** the only endpoint added is the read-only feed read, and no new mutation or action endpoint exists

### Requirement: In-repo consumer app observes the collector

The system SHALL include, in this repository, a build-less, self-contained local app that
displays harness events, served through the harness's existing local-app mechanism and
following the local-exposure rules (relative URLs, served under the harness proxy path).
The app SHALL be a **backend observer of the collector** rather than a client-side poller
that owns the listening state: on load it SHALL read the collector's current sources and
the aggregated event stream from the backend and resume rendering the live feed, so that a
page reload does not stop or restart listening. The app SHALL render events **generically
from the envelope** (showing each event's `type`, `source`, time, and payload, plus which
registered source it arrived through), so it still serves as the test bed for future event
types. The app SHALL also let the operator manage sources (add a harness by address,
start/stop, remove), with those controls calling the collector's source-management
endpoints; the credential field SHALL be write-only and never pre-filled from a stored
value.

#### Scenario: Reload resumes the feed without re-starting

- **WHEN** the consumer app is showing the live feed and the page is reloaded
- **THEN** on load it reads the collector's backend state and resumes showing the live
  aggregated feed without the operator pressing start again

#### Scenario: The app shows turn-ended events arriving from a source

- **WHEN** the app is open and an agent turn ends on any collected harness
- **THEN** on its next poll the app displays the corresponding `turn.ended` event with its
  repository, session, status, and the source it came from

#### Scenario: The app renders an unknown event type generically

- **WHEN** an event whose `type` the app does not specifically know about appears in the aggregate
- **THEN** the app still displays it using the common envelope fields rather than ignoring
  it or breaking

#### Scenario: Adding a harness is write-only for the credential

- **WHEN** the operator adds a harness source with a credential through the app
- **THEN** the credential is submitted to the backend and is never displayed back or
  pre-filled by the app

### Requirement: Agent turn-started event

The system SHALL publish a `turn.start` event to the harness event feed when the
harness launches an agent chat turn. The event's `source` SHALL identify the
repository the turn runs in; its `data` SHALL include a unique turn identifier
(`turnId`) minted at launch and, when the turn resumes an existing session, that
session identifier. Publishing SHALL be best-effort with the same contract as
`turn.ended`: a failure to publish SHALL NOT disrupt or alter the chat run, and
no additional instrumentation of the agent gateway's internal steps is required.

#### Scenario: Launching a turn publishes turn.start

- **WHEN** the harness launches an agent turn in a repository
- **THEN** a `turn.start` event is published whose `source` identifies the repository and whose `data` carries a fresh `turnId`

#### Scenario: Start and end pair by turnId

- **WHEN** that same turn later reaches its terminal state
- **THEN** the corresponding `turn.ended` event's `data` carries the same `turnId`, so consumers can pair the two without heuristics

