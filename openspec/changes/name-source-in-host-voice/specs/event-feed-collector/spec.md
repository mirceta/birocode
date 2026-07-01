## MODIFIED Requirements

### Requirement: Register and pull remote harnesses read-only

The collector SHALL let an operator register a `remote` source by entering a harness address and a **required, non-blank label** (plus an optional credential), after which the collector SHALL pull that harness's read-only event feed (`GET /api/events`) on a background loop and merge its events into the aggregate. A registration whose label is missing or blank SHALL be rejected. Any operator-entered address SHALL be allowed (no allowlist). The collector SHALL be **strictly read-only toward every observed harness** — it SHALL only issue `GET` requests to a source's feed and SHALL NOT cause or expose any action on a watched harness. A failing source (unreachable, unauthorized, timed out) SHALL surface a status with a reason and SHALL NOT stall other sources or the harness.

#### Scenario: A registered remote harness streams its events

- **WHEN** a reachable, authorized remote harness is registered with a label
- **THEN** its events appear in the aggregated feed tagged with that source, advancing by
  the source's own watermark so events are not re-fetched

#### Scenario: A blank label is rejected

- **WHEN** an operator attempts to register a source with a missing or whitespace-only label
- **THEN** the registration is rejected with an error and no source is added

#### Scenario: A failing source is isolated

- **WHEN** one registered source is unreachable or its credential is rejected
- **THEN** that source's status reflects the error reason while the other sources and the
  harness continue unaffected

#### Scenario: The collector never acts on a watched harness

- **WHEN** the collector interacts with any source
- **THEN** it issues only read (`GET`) requests to that source's event feed and triggers no
  action or mutation on the watched harness

### Requirement: Optional audible host-side sound on new events

The system SHALL provide an operator-toggled, persisted setting that, when enabled, plays an audible cue **on the computer running the harness** each time the collector ingests a new event — independent of any browser or open frontend. The cue SHALL have a persisted, operator-selectable **mode**: `beep` (the default) plays the host's audible notification sound, falling back to a console beep only where that is unavailable; `voice` instead speaks a short text-to-speech phrase in a soft, soothing female voice through the default audio device, and in `voice` mode the phrase SHALL name the source the event arrived through — "agent {source label} has finished". A silent console beep alone SHALL NOT be relied upon, and where the voice path is unavailable the system SHALL fall back to the beep so the cue remains best-effort. The system SHALL also expose a one-shot test that plays the cue immediately regardless of the enable toggle and in the currently selected mode, so the operator can confirm the host can produce that cue. Both the enable state and the selected mode SHALL be exposed and settable under the harness's existing authentication.

#### Scenario: Voice mode names the finishing source

- **WHEN** the mode is `voice`, the setting is enabled, and the collector ingests a new event from a source labelled "build-box"
- **THEN** the host computer speaks "agent build-box has finished" through its default audio device

#### Scenario: Host cue plays on a new event when enabled

- **WHEN** the host-sound setting is enabled and the collector ingests a new event
- **THEN** the host computer plays the cue for the currently selected mode, with no browser required

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
