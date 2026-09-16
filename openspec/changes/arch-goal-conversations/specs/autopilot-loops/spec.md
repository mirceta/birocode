## ADDED Requirements

### Requirement: A goal loop on a goal conversation is paced by the quiet floor alone

The engine SHALL treat a goal loop armed on an arch conversation that runs a goal as
polling only: a repeat of the goal prompt SHALL wait for the quiet floor and SHALL never
be advanced by a managed repo turn; the first send of an arm and the verification prompt
SHALL go out at once. Each send of such a loop SHALL be prefixed with the Operator
messages queued while the conversation was busy, composed only when the run slot is free.

#### Scenario: Polling

- **WHEN** a goal conversation answered its last poll two minutes ago with a five-minute floor and a driven agent finishes a turn
- **THEN** the loop holds, and the next poll goes out three minutes later carrying any queued Operator message
