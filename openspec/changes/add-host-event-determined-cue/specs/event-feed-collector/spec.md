## MODIFIED Requirements

### Requirement: Optional audible host-side sound on new events

The system SHALL provide an operator-toggled, persisted setting that, when enabled, plays an audible cue **on the computer running the harness** each time the collector ingests a new event — independent of any browser or open frontend. The cue SHALL be **selected by the event's `type`**, so that different kinds of event are distinguishable by ear: a `turn.start` event and a `turn.ended` event SHALL produce a distinguishable cue, and an event whose `type` has neither SHALL fall back to a generic cue rather than being silent. The cue SHALL have a persisted, operator-selectable **mode**: in `beep` (the default) the type selection is a distinct host notification sound per type, falling back to a console beep only where that is unavailable; in `voice` the system instead speaks a short text-to-speech phrase that reflects the event — an agent **started** for `turn.start` versus an agent **has finished** for `turn.ended` — naming the source it arrived through, in a soft, soothing female voice through the default audio device. A silent console beep alone SHALL NOT be relied upon, and where the voice path is unavailable the system SHALL fall back to the beep so the cue remains best-effort. The system SHALL also expose a one-shot test that plays a cue immediately regardless of the enable toggle; the test SHALL accept an **explicit mode** so the operator can audition `beep` and `voice` independently, and SHALL play in the currently selected mode when none is given. Both the enable state and the selected mode SHALL be exposed and settable under the harness's existing authentication.

#### Scenario: Host cue plays on a new event when enabled

- **WHEN** the host-sound setting is enabled and the collector ingests a new event
- **THEN** the host computer plays the cue selected for that event's `type` in the currently selected mode, with no browser required

#### Scenario: Start and finish are audibly different on the host

- **WHEN** the host sound is enabled and the collector ingests a `turn.start` event, then a `turn.ended` event
- **THEN** the host computer plays two distinguishable cues — in `beep` mode a different notification sound for each, and in `voice` mode "…started" versus "…has finished"

#### Scenario: An unknown event type still makes a host sound

- **WHEN** the host sound is enabled and the collector ingests an event whose `type` has no type-specific cue
- **THEN** the host computer plays the generic fallback cue rather than staying silent

#### Scenario: Voice mode speaks a phrase that reflects the event

- **WHEN** the mode is `voice`, the setting is enabled, and the collector ingests a `turn.ended` event from a labelled source
- **THEN** the host computer speaks that the named agent has finished through its default audio device and does not play the beep

#### Scenario: Beep mode remains the default

- **WHEN** the mode has never been changed and the enabled host sound fires
- **THEN** the host computer plays an audible notification beep, not speech

#### Scenario: Host cue stays silent when disabled

- **WHEN** the host-sound setting is disabled and the collector ingests a new event
- **THEN** the host computer plays no sound in any mode

#### Scenario: Test plays an explicitly requested mode on demand

- **WHEN** the operator triggers the host-sound test asking for `beep`, then asks for `voice`
- **THEN** the host computer immediately plays the beep, then speaks, regardless of the enable toggle and regardless of the currently selected live mode

#### Scenario: Test with no mode plays the current mode

- **WHEN** the operator triggers the host-sound test without specifying a mode
- **THEN** the host computer immediately plays the cue for the currently selected mode even if the enable toggle is off

#### Scenario: The host-sound setting and mode survive a restart

- **WHEN** the operator enables the host sound, selects a mode, and the harness restarts
- **THEN** both the enabled state and the selected mode remain from their persisted state

#### Scenario: Voice falls back to beep where speech is unavailable

- **WHEN** the mode is `voice` but the host cannot produce speech (no SAPI voice available)
- **THEN** the host plays the beep instead so the cue is still best-effort, and the failure does not stall the collector
