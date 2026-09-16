# task-graph — delta for kanban-worker-window

## ADDED Requirements

### Requirement: Kanban cards open their assignee in one reused worker window
Each assignee chip on a Kanban card SHALL offer an "open in worker window"
control that opens that assignee's machine harness with that repo agent's dock
active, in a single shared worker window named `birocode-worker`: every click,
for any card and any machine, SHALL reuse (renavigate) the same window rather
than opening another. The target URL SHALL be derived from the same
peer-registry address the Fleet Status "open harness" link uses (self: this
harness's root, proxy-prefix aware) plus the deep link carrying the target
machine's own repoId; when the machine's address is not known the control
SHALL be absent rather than a guessed or broken link. On a multi-assignee card
each assignee SHALL get its own control targeting its own machine and agent.

#### Scenario: Two clicks, one window
- **WHEN** the Operator clicks the worker control on a card assigned to machine A, then on a card assigned to machine B
- **THEN** one worker window opens at A's harness and the second click navigates that same window to B's harness — no second window

#### Scenario: Unknown machine degrades gracefully
- **WHEN** a card's assignee is on a machine whose address the hub does not know
- **THEN** that assignee's chip shows no worker control
