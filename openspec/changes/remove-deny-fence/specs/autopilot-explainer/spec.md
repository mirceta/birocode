## MODIFIED Requirements

### Requirement: Drive the loop decision by hand in a simulator

The explainer SHALL include a hands-on simulator of deterministic loop mode that lets the
reader drive the per-turn decision by hand instead of only reading it. The reader SHALL be
able to arm the loop and then supply, turn by turn, what the agent replied, and the
simulator SHALL apply the same deterministic check order loop mode uses
(errored → sentinel/done → needs-human/escalate → iteration cap → otherwise resend),
advancing an iteration count and reporting the outcome of each turn. The simulator SHALL
operate entirely client-side and SHALL NOT send anything to a real agent.

#### Scenario: Loop resends while still working

- **WHEN** the reader arms the loop and reports that the agent is still working (no finish signal, no escalation, cap not reached)
- **THEN** the simulator resends, the iteration count advances, and the loop continues

#### Scenario: Loop stops on the finish signal

- **WHEN** the reader reports that the agent replied with the agreed finish (sentinel) phrase
- **THEN** the simulator stops the loop as done and does not resend

#### Scenario: Loop escalates when the agent needs the human

- **WHEN** the reader reports that the agent replied with `NEEDS_HUMAN:` and a question
- **THEN** the simulator stops and escalates rather than resending

#### Scenario: Loop stops at the iteration cap

- **WHEN** the loop reaches its configured iteration cap
- **THEN** the simulator stops and marks the loop capped
