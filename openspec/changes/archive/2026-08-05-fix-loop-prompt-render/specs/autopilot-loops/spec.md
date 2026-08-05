# autopilot-loops — delta

The engine's send path bypassed the chat surface entirely: it claimed the run
slot and streamed the CLI's reply events, but nothing carried the prompt
itself to watching clients.

## ADDED Requirements

### Requirement: A loop send publishes its prompt into the run's event stream

Before starting the CLI for a drive-mode send, the engine SHALL emit the full
prompt text as a user-message event into the claimed run's seq-numbered event
buffer, so that it is broadcast to attached chat clients and replayed to
clients that attach after the send (same `?after=N` replay contract as every
other run event).

#### Scenario: Prompt precedes reply in the buffer

- **WHEN** a loop send claims the run slot and starts the CLI
- **THEN** the run's event buffer contains the user-message event with the sent prompt at a lower seq than any of the CLI's reply events

#### Scenario: Late attach replays the prompt

- **WHEN** a client attaches to the run stream after the send with `after=0`
- **THEN** the replay delivers the user-message event before the reply events
