## ADDED Requirements

### Requirement: Discovery survives client disconnect

The system SHALL run each discovery as a backend-owned job whose lifetime is
independent of the HTTP request that started it. A client disconnect — including
a browser refresh, tab close, or navigation away — SHALL NOT cancel the
in-flight agent scan. The discovery cancellation token passed into the agent run
SHALL NOT be derived from the request's abort signal.

#### Scenario: Refresh mid-scan does not waste the agent call

- **WHEN** a discovery is running for a repository and the End User refreshes or closes the page before it finishes
- **THEN** the agent scan continues to completion and its result is retained server-side, rather than being cancelled

#### Scenario: Only one discovery per repository at a time

- **WHEN** a discovery is already running for a repository and another discovery is requested for that same repository
- **THEN** the system joins the existing in-flight job rather than starting a second concurrent scan of the same repository

### Requirement: Reattach to in-flight or recently-completed discovery

The system SHALL retain, per repository, the state of the most recent discovery
as one of running, done, or error, together with its result (when done) and its
start/finish timing. The system SHALL expose this state so that a dock loading or
reloading for that repository can rejoin a scan still in progress or pick up a
result that completed while the client was away, without starting a new scan.

#### Scenario: Reattach to a scan still running

- **WHEN** a dock for a repository loads while a discovery for that repository is still running
- **THEN** the dock observes the running state and shows in-progress feedback, without triggering a new discovery

#### Scenario: Pick up a result that completed while away

- **WHEN** a discovery completes while the page is closed or refreshed, and the dock for that repository later loads
- **THEN** the dock observes the completed result and shows the discovered apps, without re-running the scan

#### Scenario: Observe a failed discovery

- **WHEN** the most recent discovery for a repository ended in error and the dock for that repository loads
- **THEN** the dock observes the error state and surfaces the failure, without silently appearing idle

### Requirement: Per-call metadata is correct under concurrency

When multiple discoveries run concurrently, the system SHALL associate each
discovery's reported metadata (such as call number, input/output tokens, cost,
and duration) with that discovery's own underlying agent call, never with a
sibling concurrent call's. Each call SHALL carry a distinct gateway identity or
correlation so the response record is resolved unambiguously rather than by
"most recent record for a shared name".

#### Scenario: Concurrent discoveries report their own metadata

- **WHEN** two or more discoveries from different repositories run at the same time through the shared agent gateway
- **THEN** each discovery's response carries the metadata of its own agent call, with no cross-wiring between the concurrent calls

#### Scenario: Discovered apps are unaffected by metadata routing

- **WHEN** discoveries run concurrently
- **THEN** each repository's discovered-apps list (`name`, `port`, `folder`, `evidence`) remains correct regardless of how response metadata is matched
