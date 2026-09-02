## ADDED Requirements

### Requirement: Arch wake event
The system SHALL publish an `arch.wake` event to the harness event feed whenever the
arch loop sends a wake prompt to the arch agent. The event's `source` SHALL identify
the arch agent (`repoId: "@arch"`, `repoName: "arch"`); its `data` SHALL include the
feed watermark the wake was computed from, the repo ids whose events triggered it,
and the arch session id. Publishing SHALL be best-effort under the same contract as
`turn.ended`: a failure to publish SHALL NOT disrupt the arch turn, and the event
SHALL use the existing envelope so existing readers render it generically.

#### Scenario: A wake publishes arch.wake
- **WHEN** the arch loop composes a wake prompt from `turn.ended` events of repos A and B and sends it
- **THEN** an `arch.wake` event appears in the feed with `data.repoIds` containing A and B and `data.after` equal to the watermark used

#### Scenario: Consumers render it without change
- **WHEN** the events app or a remote collector receives an `arch.wake` event
- **THEN** it is shown with its type, source, time and payload, and the default sound cue plays when sound is on
