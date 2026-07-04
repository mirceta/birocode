## ADDED Requirements

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

## MODIFIED Requirements

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
