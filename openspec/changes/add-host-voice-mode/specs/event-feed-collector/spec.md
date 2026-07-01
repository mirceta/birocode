## MODIFIED Requirements

### Requirement: Optional audible host-side sound on new events

The system SHALL provide an operator-toggled, persisted setting that, when enabled, plays an audible cue **on the computer running the harness** each time the collector ingests a new event — independent of any browser or open frontend. The cue SHALL have a persisted, operator-selectable **mode**: `beep` (the default) plays the host's audible notification sound, falling back to a console beep only where that is unavailable; `voice` instead speaks a short robotic text-to-speech phrase — "an agent has finished" — through the default audio device. A silent console beep alone SHALL NOT be relied upon, and where the voice path is unavailable the system SHALL fall back to the beep so the cue remains best-effort. The system SHALL also expose a one-shot test that plays the cue immediately regardless of the enable toggle and in the currently selected mode, so the operator can confirm the host can produce that cue. Both the enable state and the selected mode SHALL be exposed and settable under the harness's existing authentication.

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
