## ADDED Requirements

### Requirement: A goal loop on an arch goal conversation resumes after NEEDS_HUMAN

A goal-kind loop on an arch goal conversation that resolved as `escalate` / `needs-human`
SHALL be re-activatable in place (`ResumeGoal`): same goal, prompts, mode and cap, a fresh
arming generation (so the pre-arm freshness gate ignores the question reply), the iteration
budget restarted and the phase back to work. A loop that was stopped, capped or errored
SHALL NOT be resumed this way, nor a loop of another kind.

#### Scenario: Resume only from escalate

- **WHEN** a goal loop escalated with NEEDS_HUMAN and the Operator's answer lands
- **THEN** the loop is active again with 0 iterations done and its cap unchanged
- **WHEN** a goal loop capped
- **THEN** `ResumeGoal` answers null and the goal must be continued as a new goal
