## ADDED Requirements

### Requirement: Driven loops on the arch agent
The system SHALL let the Operator arm the goal and recipe loop kinds on the arch
agent's own conversation through the same loop control, store and engine the repo
docks use, keyed to the reserved id `@arch` with the arch home as the working
directory, the arch MCP tools and tool denials, the briefing and the audit. Two arch
rules SHALL apply on top of the kind's decision: a reply ending in `NEEDS_HUMAN:`
SHALL hold as escalated instead of stopping the loop, and a re-send of the same prompt
the arch agent last received SHALL wait until a managed repo turn started or ended
since the last arch turn OR until an operator-set quiet floor (default 5 minutes)
has elapsed since the last send, whichever comes first, while a new prompt (the first
send of an arming, a verification prompt, a phase change, the next step) SHALL be sent
at once. Whether a send is the first of an arming SHALL be decided from the instance's
own record, never from process memory, and the hold SHALL state the time left until
the next re-prompt.

#### Scenario: A goal drives the arch agent
- **WHEN** the Operator arms a goal loop on the arch agent and no arch turn is running
- **THEN** the work prompt is sent to the arch conversation with the arch tools, and the loop is shown on the Arch surface as the armed goal with its progress

#### Scenario: The work prompt is not re-sent while repo agents work
- **WHEN** the arch agent answered the work prompt without `LOOP_DONE` and no managed repo turn has started or ended since
- **THEN** the loop holds, and the next managed repo turn event lets the work prompt go out again

#### Scenario: Silence does not park the loop
- **WHEN** the arch agent answered the work prompt without `LOOP_DONE`, no managed repo turn arrives, and the quiet floor elapses
- **THEN** the work prompt is sent again, and the hold before it showed the remaining time

#### Scenario: A re-arm's first send goes out
- **WHEN** a goal loop on the arch agent had sent before, stopped, and is armed again
- **THEN** its first send of the new arming goes out at once, without waiting for a wake

#### Scenario: Verification is immediate
- **WHEN** the arch agent's reply ends with `LOOP_DONE`
- **THEN** the verification prompt is sent at once, without waiting for a wake

### Requirement: The standing wake loop returns after a driven loop
The system SHALL remember that the standing arch wake loop was armed (mode and cap)
when a driven loop takes the `@arch` slot, and SHALL re-arm the wake loop with those
settings when the driven loop ends — done, capped, errored, or disarmed from the loop
control — moving the watermark to the present. The Operator's own Stop of the standing
loop SHALL clear that memory.

#### Scenario: Goal ends, wake loop back
- **WHEN** the wake loop was armed, the Operator arms a goal on the arch agent, and the goal later resolves as done
- **THEN** the wake loop is armed again with the same mode and cap and no history is replayed

#### Scenario: Standing loop was off
- **WHEN** the wake loop was not armed and a goal on the arch agent resolves
- **THEN** nothing is re-armed
