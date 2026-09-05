## ADDED Requirements

### Requirement: Operator override of the claimed rule

The arch agent SHALL be able to send to a claimed repo agent when, and only when, the
Operator's own message explicitly asked for it; the send SHALL be audited as a claimed
override on the sending harness and, for a fleet send, on the receiving harness.

#### Scenario: The operator asked

- **WHEN** the Operator's message explicitly asks the arch to reach a repo that is on
  someone's branch and the arch calls send_task with operatorAsked
- **THEN** the claimed rule is lifted for that send on this harness and on a receiving
  harness that supports the override, and both audit it as claimed-override

#### Scenario: Nobody asked

- **WHEN** the arch sends to a claimed repo without the Operator's explicit ask
- **THEN** the send is refused as claimed exactly as before

#### Scenario: Older peer

- **WHEN** the receiving harness predates the override field
- **THEN** it answers claimed and the arch reports that the peer needs an upgrade
