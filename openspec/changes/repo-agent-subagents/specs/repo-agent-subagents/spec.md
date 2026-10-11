## ADDED Requirements

### Requirement: A repo agent can start goal-driven subagents in its own checkout
A repo agent SHALL have `start_subagent(goal, steps?, maxIterations?, name?, readOnly?)` that opens a subagent: a goal loop on key `<repoId>~sub~<id>` driving a separate CLI conversation in the same checkout, on the repo's engine and model, owned by the calling agent (its repo, tab and session). The subagent SHALL resume only its own session, mark its own step plan (`mark_step`, `edit_subagent_plan`, owner-only), and on NEEDS_HUMAN be held until the parent's `message_subagent` or the Operator's answer resumes it. When it ends, its summary SHALL be delivered once, persisted until then, as one turn tagged `subagent` in the parent's conversation. A subagent SHALL NOT start a subagent; at most 3 SHALL run per repo; a closed autopilot gate SHALL refuse a start.

#### Scenario: A 3-step subagent reports back
- **WHEN** the parent calls `start_subagent` with a goal of three STEP lines
- **THEN** the subagent works when the parent is idle, its three steps turn done with evidence, it verifies, and a turn tagged subagent carrying the step plan arrives in the parent's conversation

### Requirement: One writer at a time in a checkout
While a writer subagent's turn runs, the parent's builder send (chat or arch send) SHALL be refused naming the subagent, and a writer subagent's send SHALL wait for the parent's builder slot and for sibling writers. A read-only helper SHALL run with a read-only CLI and MAY run alongside.

#### Scenario: The parent waits for its writer
- **WHEN** a writer subagent's turn is running and the Operator sends the parent a builder prompt
- **THEN** the send is refused with code subagent-busy and the subagent's name

### Requirement: Subagents are visible in the dock and across the fleet
Each repo agent's dock SHALL offer a Subagents lane (the Management Subagents panel with the repo agent as owner: selector with status circles, stepper, answer box, stop and continue, a running-count badge). Fleet Status rows and the peer describe SHALL carry the agent's subagent counts, and the hub SHALL read a repo agent's subagents (list, plan, last messages) locally or through the peer API.

#### Scenario: The hub sees a peer agent's subagents
- **WHEN** a peer's repo agent runs a subagent
- **THEN** its Status chip shows ⑂ with the running count and the Management Subagents tab lists it, readable on demand
