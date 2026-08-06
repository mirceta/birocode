## ADDED Requirements

### Requirement: Per-event-type Device sound cues in the consumer app

The consumer app SHALL, when its per-device sound setting is enabled, play a distinct
synthesized audible cue selected by the event's `type`, so that different kinds of event are
distinguishable by ear without looking at the screen. In particular a `turn.start` event and a
`turn.ended` event SHALL produce audibly different cues. An event whose `type` has no
type-specific cue SHALL fall back to a generic default cue rather than being silent, so a new
event `type` still produces sound with no code change — upholding the app's
"render generically from the envelope" contract for audio as well. The cues SHALL be produced by
in-browser Web Audio synthesis with **no audio files** vendored or fetched, keeping the app
build-less and self-contained. The cues SHALL be drawn from an **operator-selectable theme**
whose choice is **persisted per device**, and the available themes SHALL include an original,
synthesized "AoM-spirit" homage that evokes an RTS unit-acknowledgement feel without reproducing
any third-party (Age of Mythology / Ensemble / Microsoft) audio. The existing per-device sound
on/off toggle and its user-gesture audio-unlock behaviour SHALL be preserved: when sound is off
the app SHALL stay fully silent in every theme.

#### Scenario: Start and end sound different

- **WHEN** sound is enabled and the app renders a `turn.start` event, then a `turn.ended` event
- **THEN** it plays two audibly distinct cues, one for each type

#### Scenario: Unknown event type still makes a sound

- **WHEN** sound is enabled and an event whose `type` has no type-specific cue is rendered
- **THEN** the app plays the theme's generic default cue rather than staying silent

#### Scenario: A selected theme persists across reloads

- **WHEN** the operator selects a sound theme and later reloads the app on the same device
- **THEN** the app uses the previously selected theme without the operator re-selecting it

#### Scenario: An AoM-spirit theme is available and is original synthesis

- **WHEN** the operator opens the theme choices
- **THEN** an "AoM-spirit" homage theme is offered whose cues are produced by Web Audio
  synthesis with no vendored or fetched audio files

#### Scenario: Sound off is fully silent regardless of theme

- **WHEN** the per-device sound setting is off
- **THEN** the app plays no cue for any event in any theme

### Requirement: User-supplied per-event-type audio in the consumer app

The consumer app SHALL let the user assign their own audio file to an event `type`, and when
such a file is assigned and sound is enabled, it SHALL play that file as the cue for that `type`
in preference to the built-in synthesized cue. User-supplied files SHALL be stored **device-local
in the browser** (IndexedDB) and SHALL NOT be uploaded to any server or committed to the repo,
keeping the app build-less and self-contained. Assignment SHALL be per event `type`, including a
default slot applied to types that have neither a type-specific file nor a built-in cue; playback
SHALL fall back to the built-in synthesized cue for any `type` with no assigned (or no decodable)
file, so removing a file cleanly reverts that type to synthesis. A file the browser cannot decode
SHALL be rejected at assignment time rather than silently producing no sound. User-supplied
playback SHALL respect the existing per-device sound on/off toggle and its user-gesture
audio-unlock exactly as the synthesized cues do.

#### Scenario: An assigned file plays instead of the synth cue

- **WHEN** the user assigns an audio file to `turn.start` and sound is enabled
- **THEN** rendering a `turn.start` event plays the user's file rather than the built-in cue

#### Scenario: Assignments are device-local and survive reload

- **WHEN** the user assigns a file and later reloads the app on the same device
- **THEN** the assignment is still in effect, having been stored in the browser and not on any server

#### Scenario: Removing a file reverts to synthesis

- **WHEN** the user clears the file assigned to an event `type`
- **THEN** that `type` again plays the built-in synthesized cue

#### Scenario: An undecodable file is rejected

- **WHEN** the user assigns a file the browser cannot decode as audio
- **THEN** the app rejects the assignment and keeps the previous cue for that `type`
