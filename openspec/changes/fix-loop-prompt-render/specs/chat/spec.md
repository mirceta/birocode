# chat — delta

Autopilot loop sends were invisible in the live chat: the reply streamed into
the conversation but the prompt that caused it was never drawn (it only
appeared after a full refresh reloaded the transcript from disk).

## ADDED Requirements

### Requirement: Server-initiated prompts render in the live conversation

The chat surface SHALL render a Harness-initiated prompt (an autopilot loop
send) as a user message in the live conversation, without a page refresh —
both for a client already attached to the run and for one that attaches later
through the reconcile poll's replay. Prompts typed by the End User SHALL NOT
be rendered twice as a result.

#### Scenario: Watching a driven conversation

- **WHEN** an armed loop sends a prompt to the conversation the End User has open
- **THEN** the prompt appears as a user bubble above the streaming reply within one reconcile poll, with no refresh

#### Scenario: Composer sends unaffected

- **WHEN** the End User sends a prompt from the composer
- **THEN** exactly one user bubble renders for it, as before
