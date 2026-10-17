## ADDED Requirements

### Requirement: The arch agent's on/off is always visible with one switch
Every arch conversation, and the Management App's arch cards, SHALL show whether the arch agent can send tasks to repo agents — what keeps it on, or why it went off and when (the last loop that ended and what happened to the standing wake loop) — with ONE control that turns it on (the standing wake loop, on the conversation that holds it or a dedicated "Standing loop" conversation) or off (every running arch loop stops, after naming them); when turning on is blocked, the reason SHALL be shown and the control disabled.

#### Scenario: Off because the standing loop's conversation was deleted
- **WHEN** the conversation holding the standing wake loop was removed and the last goal has finished
- **THEN** the bar says the arch is OFF, that the goal finished, that the standing wake loop stopped because its conversation was deleted, and offers ▶ Turn the arch on

#### Scenario: One click on
- **WHEN** the Operator presses ▶ Turn the arch on
- **THEN** the arch is ON, kept on by the standing wake loop, and send_task works

### Requirement: Losing the arch's only loop is never silent
Removing a conversation whose loop is running SHALL warn that the arch may turn off, and the refusal the arch receives while off SHALL say why and where the Operator turns it on.

#### Scenario: Removing the standing loop's conversation
- **WHEN** the Operator removes the conversation that holds the running standing wake loop
- **THEN** the confirmation says its loop stops and the arch agent may turn OFF
