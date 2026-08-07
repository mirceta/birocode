# autopilot-loops

## MODIFIED Requirements

### Requirement: The effective deny-list is adjustable per arm

Arming a driven loop SHALL allow the operator to trim or disable deny terms
for that arm; the instance stores its effective list, the engine enforces it
for that instance only, and the global default list is unchanged for every
other arm. An instance without a per-arm list uses the global default. The
per-arm list SHALL be disclosed with the loop's gated detail. This SHALL
hold for **goal arms the same as queue arms**: the goal arm surface SHALL
present the same per-arm deny-term controls the queue arm presents, so the
operator is never led to believe a goal loop is exempt from the deny-list
it in fact enforces.

#### Scenario: Commit-and-push repo drives past item one

- **WHEN** a queue loop is armed with "push" removed from its per-arm deny-list and a step reply honestly reports a push
- **THEN** the step proceeds to verification instead of deny-escalating

#### Scenario: Default fence untouched elsewhere

- **WHEN** another loop is armed later without touching the deny controls
- **THEN** its effective deny-list is the unmodified global default

#### Scenario: Goal arm exposes the same deny controls

- **WHEN** the operator opens the goal arm surface on a dock while the global deny-list has terms
- **THEN** the same per-arm deny-term controls shown for a queue arm are shown for the goal arm, and dropping a term arms the goal loop with the trimmed effective list

#### Scenario: Goal loop drives past a trimmed term

- **WHEN** a goal loop is armed with "push" removed from its per-arm deny-list and a work reply honestly reports a push
- **THEN** the reply is not deny-escalated for that term, while other arms keep the global default

#### Scenario: Armed goal instance discloses its effective list

- **WHEN** a goal loop armed with a trimmed deny-list is inspected through the gated loop detail
- **THEN** the detail shows that instance's effective deny-list, and an untouched goal arm shows it follows the global default
