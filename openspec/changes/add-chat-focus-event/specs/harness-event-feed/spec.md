## ADDED Requirements

### Requirement: Chat composer focus event

The system SHALL publish a `chat.focus` event to the harness event feed when the End
User focuses (clicks into or keyboard-focuses) the chat composer textbox of an
agent dock. The event's `source` SHALL identify the repository the dock is bound
to; its `data` SHALL identify the dock context it was emitted from when that
context is available (e.g. the dock's tab identifier). Emission SHALL be damped
client-side: refocusing the same composer within a short cooldown window SHALL NOT
publish another event, so tabbing in and out of the composer does not flood the
feed. Publishing SHALL be best-effort with the same contract as the turn events: a
failure to publish SHALL NOT disturb typing, the composer, or the chat run, and
the End User SHALL see no error from it. The main (non-dock) chat page composer
SHALL NOT emit this event.

#### Scenario: Focusing the dock composer publishes chat.focus

- **WHEN** the End User clicks into the chat composer textbox of an agent dock
- **THEN** a `chat.focus` event is published whose `source` identifies the dock's repository, and it appears in the feed with the standard envelope

#### Scenario: Refocusing within the cooldown stays silent

- **WHEN** the End User focuses the same dock composer twice within the cooldown window
- **THEN** only the first focus publishes a `chat.focus` event

#### Scenario: A publish failure never disturbs the composer

- **WHEN** the publish request fails (network error, harness restarting)
- **THEN** the composer keeps focus and accepts typing normally, and no error is surfaced to the End User

#### Scenario: The main chat composer does not emit

- **WHEN** the End User focuses the composer on the main chat page (not a dock)
- **THEN** no `chat.focus` event is published

### Requirement: Distinct consumer-app cue for the chat focus event

The consumer app SHALL treat `chat.focus` as a type of its own in its per-type
sound handling: it SHALL have a type-specific synthesized cue audibly distinct
from the turn-event cues, and a custom-sound slot so the user can assign their own
audio file to `chat.focus` exactly as for the turn types (device-local storage,
fallback to the synthesized cue when cleared or undecodable). When sound is off
the type SHALL stay silent like every other.

#### Scenario: Chat focus sounds different from the turn events

- **WHEN** sound is enabled and the app renders a `chat.focus` event, then a `turn.start` event
- **THEN** it plays two audibly distinct cues, and neither is the generic default cue

#### Scenario: A custom file can be assigned to chat focus

- **WHEN** the user assigns an audio file to the `chat.focus` slot and sound is enabled
- **THEN** rendering a `chat.focus` event plays the user's file instead of the built-in cue, and clearing the slot reverts to the built-in cue

## MODIFIED Requirements

### Requirement: Feed reads are authenticated and expose no new actions

The harness event feed endpoints SHALL be protected by the harness's existing
authentication (a valid session cookie or the password header), the same as other
`/api/*` endpoints. The feed's read endpoint SHALL remain a pure read with no side
effects. The feed SHALL expose exactly one write endpoint: a **fixed-type publish
endpoint** for the `chat.focus` event, which accepts no event `type` from the
caller (the type is fixed server-side), derives the repository from the caller's
existing repository context, and appends a single event to the best-effort feed.
Appending that event SHALL be its only effect: the endpoint SHALL NOT cause or
expose any harness action, and clients SHALL NOT be able to publish arbitrary
event types or forge events of other types through it. Beyond this single scoped
publish endpoint, the feed SHALL NOT provide any way to cause harness actions or
mutations, and SHALL NOT expose over REST any harness action that is not already
reachable from the frontend.

#### Scenario: Unauthenticated read is rejected

- **WHEN** a client without a valid session or password requests the event feed
- **THEN** the request is rejected by the existing authentication, as with other `/api/*` endpoints

#### Scenario: Unauthenticated publish is rejected

- **WHEN** a client without a valid session or password calls the chat-focus publish endpoint
- **THEN** the request is rejected by the existing authentication and no event is appended

#### Scenario: The publish endpoint cannot forge other event types

- **WHEN** a client calls the chat-focus publish endpoint with any request body
- **THEN** the only event that can result is a `chat.focus` event with a server-derived `source`; no caller-supplied `type` is honored

#### Scenario: No action surface beyond the scoped publish

- **WHEN** the change is reviewed for new endpoints
- **THEN** the only write endpoint on the feed is the fixed-type chat-focus publish, whose sole effect is appending one event, and no other mutation or action endpoint exists
