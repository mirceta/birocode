# event-feed-collector Specification

## Purpose
TBD - created by archiving change add-event-feed-collector. Update Purpose after archive.
## Requirements
### Requirement: Backend-owned collector with a persisted source list

The system SHALL maintain a backend collector that owns a set of **event sources** and is
the single source of truth for what is being listened to. Each source SHALL have a stable
id, a label, a kind (`self` or `remote`), a remote `address` (for `remote`), and an
`active` flag. The source list SHALL be **persisted** so that after a harness restart the
collector resumes listening to the same sources without operator action. The collector
SHALL listen entirely on the backend, independent of any open frontend: a source that is
`active` SHALL continue to be collected whether or not a browser is connected.

#### Scenario: A source keeps being collected with no frontend open

- **WHEN** a source is `active` and no browser is connected to the harness
- **THEN** the collector continues pulling that source's events on the backend

#### Scenario: Listening resumes after a harness restart

- **WHEN** the harness restarts while a source was `active`
- **THEN** the collector resumes that source as `active` from the persisted source list
  without the operator re-adding or re-starting it

### Requirement: This harness is a built-in self source

The collector SHALL include this harness itself as a non-removable `self` source that is
read in-process from the harness event feed and is `active` by default. The self source
SHALL require no credential. As a result the local event stream SHALL always be present in
the aggregate without any explicit start action.

#### Scenario: Self events appear without pressing start

- **WHEN** the collector starts for the first time and a local `turn.ended` event is published
- **THEN** that event appears in the aggregated feed tagged as coming from the self source,
  with no operator start action required

#### Scenario: The self source cannot be removed

- **WHEN** a client attempts to delete the self source
- **THEN** the collector rejects the removal and keeps the self source

### Requirement: Register and pull remote harnesses read-only

The collector SHALL let an operator register a `remote` source by entering a harness
address (and an optional label and credential), after which the collector SHALL pull that
harness's read-only event feed (`GET /api/events`) on a background loop and merge its events
into the aggregate. Any operator-entered address SHALL be allowed (no allowlist). The
collector SHALL be **strictly read-only toward every observed harness** — it SHALL only
issue `GET` requests to a source's feed and SHALL NOT cause or expose any action on a
watched harness. A failing source (unreachable, unauthorized, timed out) SHALL surface a
status with a reason and SHALL NOT stall other sources or the harness.

#### Scenario: A registered remote harness streams its events

- **WHEN** a reachable, authorized remote harness is registered as a source
- **THEN** its events appear in the aggregated feed tagged with that source, advancing by
  the source's own watermark so events are not re-fetched

#### Scenario: A failing source is isolated

- **WHEN** one registered source is unreachable or its credential is rejected
- **THEN** that source's status reflects the error reason while the other sources and the
  harness continue unaffected

#### Scenario: The collector never acts on a watched harness

- **WHEN** the collector interacts with any source
- **THEN** it issues only read (`GET`) requests to that source's event feed and triggers no
  action or mutation on the watched harness

### Requirement: Aggregated, source-tagged feed paged by one watermark

The system SHALL expose the merged events from all sources over a read endpoint
`GET /api/collector/events?after=N` that returns the events whose collector sequence number
is greater than the supplied watermark, together with the current highest sequence number.
Each returned event SHALL carry the producer envelope (`type`, `source`, `at`, `data`) plus
the identity of the registered source it arrived through (a source id and label). The
collector SHALL assign a monotonic sequence number across all sources so a single watermark
pages the whole fleet. A caller supplying no watermark SHALL receive the full retained
aggregate.

#### Scenario: Incremental read across sources

- **WHEN** a client polls `GET /api/collector/events` with the highest sequence it has seen
- **THEN** it receives only newer events from any source, each tagged with its source, plus
  the current highest sequence

#### Scenario: Events identify their source

- **WHEN** events from two different sources are returned
- **THEN** each event indicates which registered source (id and label) it came from while
  preserving the original producer envelope fields

### Requirement: Source management endpoints with secret credentials

The system SHALL expose endpoints to manage the collector's own source list — list, add,
start, stop, and remove sources — under the harness's existing authentication. A source's
credential SHALL be treated as a secret: supplied write-only when adding a source, stored
**encrypted at rest**, never returned in any response, and never written to logs (including
scrubbing it out of any upstream error text). These endpoints SHALL only modify the
collector's own subscription state and SHALL NOT cause any action on a watched harness.

#### Scenario: Credential is never disclosed

- **WHEN** a source is added with a credential and the sources are later listed
- **THEN** no response includes the credential, and no log line contains it

#### Scenario: Credential is encrypted at rest

- **WHEN** a source with a credential is persisted
- **THEN** the stored representation of the credential is encrypted, not plaintext

#### Scenario: Start and stop control collection

- **WHEN** an operator stops a source and later starts it
- **THEN** the collector halts pulling that source while stopped and resumes when started,
  reflecting the change in the source's `active` state and status

### Requirement: Optional audible host-side sound on new events

The system SHALL provide an operator-toggled, persisted setting that, when enabled, plays an audible cue **on the computer running the harness** each time the collector ingests a new event — independent of any browser or open frontend. The cue SHALL have a persisted, operator-selectable **mode**: `beep` (the default) plays the host's audible notification sound, falling back to a console beep only where that is unavailable; `voice` instead speaks a short text-to-speech phrase — "an agent has finished" — in a soft, soothing female voice through the default audio device. A silent console beep alone SHALL NOT be relied upon, and where the voice path is unavailable the system SHALL fall back to the beep so the cue remains best-effort. The system SHALL also expose a one-shot test that plays the cue immediately regardless of the enable toggle and in the currently selected mode, so the operator can confirm the host can produce that cue. Both the enable state and the selected mode SHALL be exposed and settable under the harness's existing authentication.

#### Scenario: Host cue plays on a new event when enabled

- **WHEN** the host-sound setting is enabled and the collector ingests a new event
- **THEN** the host computer plays the cue for the currently selected mode, with no browser required

#### Scenario: Voice mode speaks the phrase instead of beeping

- **WHEN** the mode is `voice`, the setting is enabled, and the collector ingests a new event
- **THEN** the host computer speaks "an agent has finished" through its default audio device and does not play the beep

#### Scenario: Beep mode remains the default

- **WHEN** the mode has never been changed and the enabled host sound fires
- **THEN** the host computer plays the audible notification beep, not speech

#### Scenario: Host cue stays silent when disabled

- **WHEN** the host-sound setting is disabled and the collector ingests a new event
- **THEN** the host computer plays no sound in any mode

#### Scenario: Test plays the current mode on demand regardless of the toggle

- **WHEN** the operator triggers the host-sound test
- **THEN** the host computer immediately plays the cue for the currently selected mode even if the enable toggle is off

#### Scenario: The host-sound setting and mode survive a restart

- **WHEN** the operator enables the host sound, selects a mode, and the harness restarts
- **THEN** both the enabled state and the selected mode remain from their persisted state

#### Scenario: Voice falls back to beep where speech is unavailable

- **WHEN** the mode is `voice` but the host cannot produce speech (no SAPI voice available)
- **THEN** the host plays the beep instead so the cue is still best-effort, and the failure does not stall the collector

### Requirement: Distinguish why a source's pull was rejected

When a watched harness answers a pull but refuses it, the collector SHALL distinguish the cause in the source's surfaced status instead of reporting one generic authorization state. Specifically: an HTTP **403** SHALL surface as **blocked by the harness's IP gate** (status `ip-blocked`), including the collector's rejected IP in the detail when the response body carries it; an HTTP **401 with no credential stored** for the source SHALL surface as **requires a credential** (status `needs-credential`); an HTTP **401 with a credential stored** SHALL surface as **credential rejected** (status `bad-credential`); an HTTP **429** SHALL surface as **throttled**, not as any of the above. All of these are "alive" states (the host answered) and SHALL NOT be presented as the source being dead or unreachable. The same distinction SHALL apply on the immediate probe after registering a source, so the first status the operator sees already names the actual problem. The events app SHALL present these statuses with visibly distinct labels. Credential values SHALL never appear in any status detail.

#### Scenario: Blocked by the IP gate is named, not mistaken for a credential problem

- **WHEN** a registered source's harness answers a pull with HTTP 403 from its IP allowlist gate
- **THEN** the source's status is `ip-blocked` with a detail naming the block (and the rejected IP when the 403 body carries it), and the UI does not suggest supplying a credential

#### Scenario: Missing credential is reported as such

- **WHEN** a registered source with no stored credential is answered with HTTP 401
- **THEN** the source's status is `needs-credential` with a detail saying the harness requires a credential

#### Scenario: Wrong credential is reported as rejected

- **WHEN** a registered source with a stored credential is answered with HTTP 401
- **THEN** the source's status is `bad-credential` with a detail saying the credential was rejected, so the operator knows to re-enter it rather than wonder whether one is needed

#### Scenario: Throttling is not conflated with authorization

- **WHEN** a registered source's harness answers a pull with HTTP 429
- **THEN** the source's status reflects throttling with the response's retry detail when present, and is not reported as needing or rejecting a credential

#### Scenario: The add-time probe already distinguishes the cause

- **WHEN** an operator registers a source and the immediate probe is refused with 403 or 401
- **THEN** the source view returned by the add already carries the distinguished status (`ip-blocked`, `needs-credential`, or `bad-credential`), not a generic authorization state

