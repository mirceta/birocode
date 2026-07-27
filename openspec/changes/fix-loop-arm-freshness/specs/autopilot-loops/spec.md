# autopilot-loops — delta

Fixes the arm-time trust breaks found in the first real goal-loop run: stale
replies judged as loop responses, blank parameter fields over a persisted
record, and legacy auto-arming.

## ADDED Requirements

### Requirement: Pre-arm replies never resolve a driven loop

For DRIVEN loop kinds (recipe, goal), the engine SHALL treat an agent's
trailing assistant message as loop evidence only if it was produced at or
after the loop instance's arm time. When the trailing message predates the
arming, the kind SHALL decide as though the agent had not yet spoken — the
NEEDS_HUMAN marker, deny-list terms, the sentinel, and a pre-arm run error
in that stale context SHALL NOT stop or advance the loop — so a freshly
armed drive-mode loop's first action is sending its stored prompt. The
suggestion kind's act-on-current-trailing-message behavior is unchanged.

#### Scenario: Arming over a deploy conversation still sends

- **WHEN** a goal loop is armed in drive mode while the agent's last reply (from an earlier human conversation) contains a deny-listed term such as "deploy"
- **THEN** the loop does not escalate on that stale reply and its next tick sends the stored work prompt as iteration 1

#### Scenario: Stale sentinel does not complete a fresh loop

- **WHEN** a recipe loop is armed while the agent's trailing reply from before arming contains the loop's sentinel text
- **THEN** the loop does not resolve done and instead sends its stored prompt

#### Scenario: Fresh replies are still judged

- **WHEN** a driven loop has sent its prompt and the agent's reply produced after arming contains a deny-listed term
- **THEN** the safety ladder applies and the loop escalates with the deny-list stop reason

### Requirement: Loop parameters rehydrate from the persisted record

The dock loop control SHALL seed its parameter fields (goal text, iteration
cap, mode) from the agent's persisted loop record when the popover opens,
using the operator-gated detail read so prompt-text disclosure rules are
unchanged. A loop that resolved or survived a harness restart SHALL show the
parameters it was armed with rather than empty fields.

#### Scenario: Goal survives a restart in the UI

- **WHEN** a goal loop was armed, the harness restarts, and the user opens the agent's loop popover with the operator gate open
- **THEN** the goal textarea contains the stored goal and the cap field the stored iteration cap

#### Scenario: Gate closed still discloses nothing

- **WHEN** the operator gate is closed and the popover opens
- **THEN** the parameter fields stay unseeded and the gate-closed hint renders where prompt text would appear

### Requirement: Loops are armed only by explicit user action

The system SHALL NOT arm any loop instance except in direct response to a
user arming action. Startup migration of legacy armed-repo configuration
SHALL clear the legacy list without creating active loop instances, logging
what was dropped. A harness restart SHALL resume only loop instances that
were armed by the user and still active.

#### Scenario: Legacy armed repos do not resurrect as loops

- **WHEN** the harness starts with legacy autopilot ArmedRepoIds present and no active loop instances
- **THEN** no loop instance becomes active, and the legacy list is cleared with a log line noting the drop
