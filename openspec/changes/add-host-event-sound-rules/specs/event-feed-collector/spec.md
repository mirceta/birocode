## MODIFIED Requirements

### Requirement: Optional audible host-side sound on new events

The system SHALL provide an operator-toggled, persisted setting that, when enabled, plays an audible cue **on the computer running the harness** each time the collector ingests a new event — independent of any browser or open frontend. The cue SHALL be **selected by the event's `type`**, so that different kinds of event are distinguishable by ear: a `turn.start` event and a `turn.ended` event SHALL produce a distinguishable cue, and an event whose `type` has neither SHALL fall back to a generic cue rather than being silent. The cue SHALL have a persisted, operator-selectable **mode**: in `beep` (the default) the type selection is a distinct host notification sound per type, falling back to a console beep only where that is unavailable; in `voice` the system instead speaks a short text-to-speech phrase that reflects the event — an agent **started** for `turn.start` versus an agent **has finished** for `turn.ended` — naming the source it arrived through, in a soft, soothing female voice through the default audio device. A silent console beep alone SHALL NOT be relied upon, and where the voice path is unavailable the system SHALL fall back to the beep so the cue remains best-effort. The system SHALL also expose a one-shot test that plays a cue immediately regardless of the enable toggle; the test SHALL accept an **explicit mode** so the operator can audition `beep` and `voice` independently, and SHALL play in the currently selected mode when none is given. Both the enable state and the selected mode SHALL be exposed and settable under the harness's existing authentication.

The system SHALL additionally maintain an operator-editable **event → sound table** for the host cue, with one slot per recognized event-type key — `turn.start`, `turn.ended`, and `_default` (the same taxonomy as the browser custom-sound grid). For each slot the operator SHALL be able to upload an audio file (`.wav` or `.mp3`, size-capped) that is stored **host-side** in the harness data directory and persists across restarts, replace it, and clear it. When the host cue fires for an event whose `type` has an assigned file, the host SHALL play **that file** instead of the mode-determined built-in cue — the assignment takes precedence over both `beep` and `voice` modes. An event whose `type` has no slot of its own SHALL use the `_default` slot's file when one is assigned, else the built-in generic cue; slots with no file keep the mode-determined built-in behavior exactly as before, so a fresh install behaves identically until a file is uploaded. Playback of an assigned file SHALL be best-effort: if the file cannot be played, the host SHALL fall back to the built-in cue for that type rather than staying silent. The system SHALL expose, under the harness's existing authentication, endpoints to list the table (slot key, whether a file is assigned, and its display name — never the raw bytes in the listing), upload/replace a slot's file (rejecting unknown slot keys, disallowed formats, and oversize uploads), clear a slot, and a per-slot **test** that immediately plays on the host exactly what a live event of that type would play, regardless of the enable toggle. The events app SHALL present this table in the Sounds tab as the real "Event → sound rules" panel (replacing the placeholder), showing each slot's effective host sound and offering upload, host-test, and clear.

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

#### Scenario: An assigned custom sound plays on the host for its event type

- **WHEN** the operator uploads an audio file for the `turn.ended` slot, the host sound is enabled, and the collector ingests a `turn.ended` event
- **THEN** the host computer plays the uploaded file — not the built-in notification sound and not the spoken phrase — with no browser required

#### Scenario: A custom sound takes precedence over voice mode

- **WHEN** the mode is `voice`, the `turn.start` slot has an assigned file, and the collector ingests a `turn.start` event with the host sound enabled
- **THEN** the host plays the assigned file for `turn.start`, while a `turn.ended` event (no assigned file) still speaks its voice phrase

#### Scenario: Unknown event types use the default slot's custom sound

- **WHEN** the `_default` slot has an assigned file, the host sound is enabled, and the collector ingests an event whose `type` is neither `turn.start` nor `turn.ended`
- **THEN** the host plays the `_default` slot's file instead of the built-in generic cue

#### Scenario: Clearing a slot restores the built-in cue

- **WHEN** the operator clears a slot that had an assigned file and an event of that type is later ingested with the host sound enabled
- **THEN** the host plays the mode-determined built-in cue for that type, exactly as before any file was assigned

#### Scenario: Assigned sounds survive a restart

- **WHEN** the operator assigns a file to a slot and the harness restarts
- **THEN** the slot still has that file and a matching event plays it, with no re-upload

#### Scenario: Per-slot test plays the effective host sound on demand

- **WHEN** the operator triggers the per-slot test for a slot with an assigned file, and for a slot without one
- **THEN** the host immediately plays the assigned file for the first and the built-in cue (in the current mode) for the second, regardless of the enable toggle

#### Scenario: Invalid uploads are rejected

- **WHEN** a client uploads a file for an unknown slot key, a disallowed format, or a file over the size cap
- **THEN** the request is rejected with an explanatory error and no slot is changed

#### Scenario: An unplayable assigned file falls back to the built-in cue

- **WHEN** a slot's stored file cannot be played (corrupt or unsupported on this host) and a matching event fires with the host sound enabled
- **THEN** the host plays the built-in cue for that type rather than staying silent, and the failure does not stall the collector
