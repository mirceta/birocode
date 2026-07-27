## ADDED Requirements

### Requirement: Chat focus is a recognized host cue type

The host-side event cue SHALL recognize `chat.focus` as an event type of its own
rather than handling it only through the generic fallback: in `beep` mode it SHALL
have a distinct beep pattern, in `voice` mode a short spoken phrase in the existing
style that reflects the event (someone engaging the chat) and names the source it
arrived through, and the operator-editable event → sound table SHALL offer a
`chat.focus` slot with the same upload / clear / per-slot test behavior as the
turn-type slots, taking the same precedence over the mode-determined built-in cue.
Existing fallback behavior for other unknown types SHALL be unchanged.

#### Scenario: Chat focus beeps differently from the turn events

- **WHEN** the host sound is enabled in `beep` mode and the collector ingests a `chat.focus` event, then a `turn.start` event
- **THEN** the host plays two distinguishable beep cues, and the `chat.focus` cue is not the generic fallback

#### Scenario: Voice mode announces the chat focus

- **WHEN** the mode is `voice`, the host sound is enabled, and the collector ingests a `chat.focus` event from a labelled source
- **THEN** the host speaks a phrase reflecting that someone engaged the chat on that named source, and does not play the beep

#### Scenario: A custom host sound can be assigned to chat focus

- **WHEN** the operator uploads an audio file to the `chat.focus` slot of the event → sound table, the host sound is enabled, and a `chat.focus` event is ingested
- **THEN** the host plays the uploaded file instead of the built-in cue, and clearing the slot restores the built-in `chat.focus` cue
