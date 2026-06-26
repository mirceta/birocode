## ADDED Requirements

### Requirement: Per-repository harness event log

The system SHALL maintain, per repository, an append-only log of lifecycle events
for harness-owned background operations. Each event SHALL carry a sequence number
that is monotonically increasing per repository for the lifetime of the process,
a timestamp, an operation identifier, a phase, and a human-readable summary. The
log SHALL be bounded: when it exceeds its retention cap the oldest events SHALL be
dropped, and the sequence numbers of remaining and future events SHALL stay
monotonic. The log MAY be held in memory only and is not required to survive a
process restart.

#### Scenario: Events are appended with monotonic sequence numbers

- **WHEN** a harness-owned operation emits multiple lifecycle events for a repository
- **THEN** each event receives a sequence number strictly greater than the previous event's for that repository

#### Scenario: The log is bounded

- **WHEN** the number of retained events for a repository exceeds the retention cap
- **THEN** the oldest events are dropped while newer events are retained, and sequence numbers continue to increase monotonically

### Requirement: Lifecycle events record the harness-owned boundary only

The system SHALL record events at the boundary that the harness itself controls:
that an operation was invoked and is awaiting a response, and that a response was
received together with what the harness did with it. The system SHALL NOT record
the internal steps of the agent gateway (such as which tools a sub-agent called,
or its token usage); those remain outside the event log. Each instrumented
operation SHALL emit a starting event and a terminal event that is either a
success or an error.

#### Scenario: Discovery emits invoke-and-await then result

- **WHEN** a local-app discovery is started for a repository
- **THEN** the log gains a starting event indicating the discovery was invoked and the harness is awaiting the agent gateway
- **AND WHEN** the discovery completes
- **THEN** the log gains a terminal event indicating the result (for success, including how many apps were found; for failure, indicating the error)

#### Scenario: Run and check emit their own boundary events

- **WHEN** the harness launches a discovered app, or probes whether a port is listening, for a repository
- **THEN** the log gains a starting event for that operation and a terminal event describing the outcome the harness observed (for a launch, that the launch was issued; for a check, whether the port was live)

#### Scenario: Gateway internals are not logged

- **WHEN** a harness operation runs through the agent gateway
- **THEN** the event log records only that the harness invoked the gateway and what it received back, not the gateway's internal tool calls or token usage

#### Scenario: Joining an in-flight operation does not duplicate the start

- **WHEN** an operation for a repository is already running and the same operation is requested again so that the request joins the in-flight one
- **THEN** no additional starting event is emitted for the joined request

### Requirement: Event log is readable by sequence watermark

The system SHALL expose, for a repository, the events whose sequence number is
greater than a caller-supplied watermark, together with the current highest
sequence number for that repository. A caller that supplies no watermark (or one
below the earliest retained event) SHALL receive the full retained log. This
SHALL allow a client to poll incrementally, advancing its watermark, without
re-receiving events it has already seen.

#### Scenario: Incremental read returns only newer events

- **WHEN** a client requests the events for a repository with a watermark equal to the highest sequence it has already received
- **THEN** the response contains only events newer than that watermark, plus the current highest sequence number

#### Scenario: Fresh read returns the retained log

- **WHEN** a client requests the events for a repository with no watermark
- **THEN** the response contains the full retained event log for that repository

### Requirement: Event Console lane in the agent dock

The system SHALL present the per-repository event log as a Console lane within
the agent dock, as a sibling to the dock's existing lanes. The lane SHALL be
scoped per repository, so that two dock tabs opened on the same repository
observe the same event log. The lane SHALL refresh by polling the read endpoint
at the dock's polling cadence while it is shown, and SHALL render events in
chronological order. The lane SHALL default to Advanced UI mode.

#### Scenario: Two docks on one repository see the same console

- **WHEN** two dock tabs are open on the same repository and an operation for that repository emits events
- **THEN** both tabs' Console lanes show those same events

#### Scenario: Console reflects a discovery run as it progresses

- **WHEN** the Console lane is shown for a repository and a discovery is started and later completes
- **THEN** the lane shows the starting event and then, on the next poll after completion, the terminal event, in chronological order

#### Scenario: Console lane defaults to Advanced mode

- **WHEN** the UI is in Basic mode and the End User has not been granted the Console lane
- **THEN** the Console lane is not shown; in Advanced mode it is available
