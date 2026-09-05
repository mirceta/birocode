## MODIFIED Requirements

### Requirement: Arch sends are fenced, capped, and audited like loop sends
The suggest/drive mode and the audit log SHALL apply to arch sends unchanged. The
drive cap SHALL be optional for the arch loop: it defaults to none (`0`), and when the
Operator sets one a send beyond it SHALL return `capped`. The text of a send SHALL NOT
be word-filtered (the deny-word fence was removed, openspec remove-deny-fence). In
suggest mode the wake prompt SHALL pre-fill the Arch tab composer instead of being sent.

#### Scenario: Risky words do not block an arch send
- **WHEN** the arch agent calls `send_task` on an armed loop with text such as "commit and push, then merge"
- **THEN** the send proceeds through the normal availability, slot and audit path

#### Scenario: Suggest mode holds the wake prompt
- **WHEN** the arch loop is armed in suggest mode and a managed repo publishes `turn.ended`
- **THEN** the composed wake prompt appears in the Arch tab composer and no arch turn runs until the Operator sends it

#### Scenario: Uncapped by default
- **WHEN** the Operator arms the arch loop without setting a cap
- **THEN** wake-ups keep being sent past the sixth, seventh and any later one until the Operator stops the loop

### Requirement: The arch loop wakes the arch agent from the event feed
The system SHALL provide an arch loop kind whose single instance is keyed to `@arch`
rather than a repo. On each engine tick it SHALL read the collector's event feed past
a persisted watermark, keep `turn.start` and `turn.ended` events whose source
identifies a managed agent — a managed local repo on the self source, or a managed
`(source, repo)` pair on a subscribed harness — and when any exist SHALL propose one
arch turn whose prompt describes them, naming the machine. It SHALL ignore
`chat.focus`. When nothing new exists it SHALL hold. On a missing watermark it SHALL
start from the collector's current last sequence and SHALL NOT replay history. It
SHALL publish an `arch.wake` event when it sends a wake prompt.

A reply from the arch agent ending in `NEEDS_HUMAN: <question>` SHALL NOT stop the
loop. With no new wake it SHALL hold as escalated, exposing the question, so the Arch
surface shows "waiting for you: <question>" while the loop stays armed; a new wake
SHALL still propose an arch turn, and a later reply without the marker SHALL clear
the hold. Only the Operator's Stop, an errored turn, or a reached cap SHALL stop the
loop.

#### Scenario: Remote repo turn ends, arch agent wakes
- **WHEN** a managed repo on a subscribed harness publishes `turn.ended`, the collector ingests it, and the next tick runs
- **THEN** exactly one arch turn runs with a prompt naming that machine and repo, and the watermark advances past the event

#### Scenario: Unmanaged remote turns do not wake
- **WHEN** only events from repos on subscribed harnesses that are not in scope arrive since the watermark
- **THEN** the loop holds and the watermark still advances

#### Scenario: A question holds instead of stopping
- **WHEN** the arch agent's reply ends with `NEEDS_HUMAN: which repo first?` and no managed repo has finished a turn
- **THEN** the loop stays armed, the engine reports an escalated hold with that question, and the Arch surface shows it as waiting for the Operator

#### Scenario: Other repos are not blocked by the question
- **WHEN** the loop is holding on a question and a managed repo publishes `turn.ended`
- **THEN** one arch turn runs for that wake as usual

## ADDED Requirements

### Requirement: The Operator's reply resumes a stopped arch loop
The system SHALL re-activate a stopped arch loop in place when the loop had stopped
as `escalate` or `capped` and the Operator sends a message in the arch chat — same mode
and cap, move the watermark to the collector's current last sequence so no history
replays, and start a fresh arming generation. A loop stopped by the Operator's own
Stop or by an errored turn SHALL NOT be resumed this way.

#### Scenario: Answering the question resumes the loop
- **WHEN** the arch loop shows `escalate · needs-human` from an earlier build's stop and the Operator replies in the arch chat
- **THEN** the loop is armed again without pressing Arm and the next managed repo turn wakes the arch agent

#### Scenario: A stopped loop stays stopped
- **WHEN** the Operator pressed Stop and later sends a message in the arch chat
- **THEN** the loop remains stopped
