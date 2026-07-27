# autopilot-loops — delta

Seeds the baseline for the already-built loop mode (built pre-OpenSpec,
currently spec-less) and adds the adoption behaviors from this change.

## ADDED Requirements

### Requirement: Deterministic fixed-prompt loop per agent

The system SHALL support at most one loop per agent (repo): an armed loop
resends one fixed prompt to the agent — resuming its existing session through
the same run path the chat UI uses — each time the agent's turn completes,
until a stop condition resolves the loop. Arming a loop SHALL reset its
iteration counter; loop configuration and live counters SHALL persist across a
harness restart so an in-flight loop resumes where it left off. The loop
decision SHALL be deterministic: no LLM judge and no classifier is consulted,
and a repo with an active loop SHALL be skipped by the classifier engine so the
two can never both send to the same agent.

#### Scenario: Resend on turn completion

- **WHEN** an agent with an active loop finishes its turn and no stop condition applies
- **THEN** the loop's fixed prompt is resent to that agent's session exactly once and the iteration counter increments

#### Scenario: Loop survives a restart

- **WHEN** the harness restarts while a loop is active
- **THEN** the loop resumes with its prompt, sentinel, cap, and iteration count intact

### Requirement: Ordered stop conditions including needs-human escalation

The system SHALL evaluate stop conditions for an active loop in this order when
the agent's turn completes: (1) the run errored → resolve `error`; (2) the last
assistant message contains the loop's sentinel phrase → resolve `done`; (3) the
last assistant message contains the `NEEDS_HUMAN:` marker → resolve `escalate`;
(4) the last assistant message contains a deny-listed term → resolve
`escalate`; (5) the iteration cap is reached → resolve `capped`; otherwise
resend. All matching SHALL be deterministic string matching. Every resolution
SHALL deactivate the loop so it no longer ticks.

#### Scenario: Sentinel stops the loop as done

- **WHEN** a looping agent's last message contains the loop's sentinel phrase
- **THEN** the loop resolves `done` and no further prompt is sent

#### Scenario: NEEDS_HUMAN escalates

- **WHEN** a looping agent's last message contains `NEEDS_HUMAN:`
- **THEN** the loop resolves `escalate` and no further prompt is sent

#### Scenario: Cap refuses to over-run

- **WHEN** a looping agent finishes a turn and the iteration counter has reached the loop's cap
- **THEN** the loop resolves `capped` and no further prompt is sent

### Requirement: Stop reason is recorded with detail

The system SHALL record, on every loop resolution, a machine-readable stop
reason (which condition fired) and a human-readable detail — the matched
deny-list term, the text following the `NEEDS_HUMAN:` marker, or the cap
count — and SHALL surface both wherever the loop's terminal state is shown, so
each stopped loop answers "why did it stop".

#### Scenario: Escalation carries the agent's question

- **WHEN** a loop resolves `escalate` from a `NEEDS_HUMAN: <question>` marker
- **THEN** the stored stop detail contains the question text and the loop's UI shows it

### Requirement: Loop actions are operator-gated and audited

The system SHALL fence every loop action (arm, update, stop) behind the
operator gate — host-opened, off by default, never openable from the web — and
SHALL refuse actions with an explicit gate-closed error while it is closed. The
engine SHALL NOT resend while the gate or the kill switch is off. Every
unattended resend SHALL be recorded in the append-only autopilot audit log.

#### Scenario: Gate closed blocks arming

- **WHEN** a client attempts to arm a loop while the operator gate is closed
- **THEN** the request is rejected with an explicit gate-closed error and no loop is armed

#### Scenario: Resends are audited

- **WHEN** the engine resends a loop prompt
- **THEN** an audit entry recording the repo, prompt, and loop outcome is appended durably

### Requirement: Loop status is readable without the operator gate

The system SHALL expose a read-only loop-status projection (per-repo loop
state, iteration count, terminal status, stop reason/detail, recipe names)
behind normal session auth but NOT behind the operator gate, so dashboard
surfaces can show a loop's outcome after the gate is closed. This projection
SHALL disclose loop status only — no autopilot configuration and no action
surface.

#### Scenario: Terminal state visible after the gate closes

- **WHEN** a loop resolved `escalate` and the operator gate has since been closed
- **THEN** an authenticated client can still read that loop's terminal state and stop reason
