## ADDED Requirements

### Requirement: A goal template in chat is proposed, discussed, then started on the Operator's go
The arch agent's guidance SHALL say that a goal template arriving in its chat (a GOAL TEMPLATE message with purpose, inputs, defaults and STEP lines) is to be restated and discussed with the Operator — raising busy agents, missing inputs, steps to add or drop — and started with start_arch_goal and the agreed steps only when the Operator says to start it, never on arrival.

#### Scenario: A template arrives
- **WHEN** the Operator sends a GOAL TEMPLATE message to the arch
- **THEN** the arch replies with the plan and any concerns and does not start a goal until the Operator says "start it"
