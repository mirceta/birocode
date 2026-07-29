# autopilot-loops — delta

Gives loops a kind — 📋 recipe (today's fixed-prompt loop, renamed) and 🎯 goal
(new: free-text goal + deterministic verification pass) — makes autopilot
arming XOR per agent, and adds a gated prompt-inspection read. Modifies the
loop requirements introduced by `adopt-autopilot-loops` /
`align-dock-loop-model` (still unarchived).

## MODIFIED Requirements

### Requirement: Deterministic fixed-prompt loop per agent

The system SHALL support at most one loop per agent (repo), typed by a kind:
a **recipe** loop resends one fixed stored prompt, and a **goal** loop resends
prompts composed server-side from the user's goal text at arm time. In both
kinds the loop resends only stored, byte-identical prompt text to the agent —
resuming its existing session through the same run path the chat UI uses —
each time the agent's turn completes, until a stop condition resolves the
loop. Arming a loop SHALL reset its iteration counter; loop configuration
(including kind, goal text, and phase) and live counters SHALL persist across
a harness restart so an in-flight loop resumes where it left off. The loop
decision SHALL be deterministic: no LLM judge and no classifier is consulted,
and a repo with an active loop SHALL be skipped by the classifier engine so
the two can never both send to the same agent. A stored loop without a kind
SHALL load as a recipe loop.

#### Scenario: Resend on turn completion

- **WHEN** an agent with an active loop finishes its turn and no stop condition applies
- **THEN** the loop's stored prompt for its kind and phase is resent to that agent's session exactly once and the iteration counter increments

#### Scenario: Loop survives a restart

- **WHEN** the harness restarts while a goal loop is mid-verification
- **THEN** the loop resumes with its kind, goal, prompts, phase, cap, and iteration count intact

#### Scenario: Legacy entries load as recipe loops

- **WHEN** a loops file written before kinds existed is loaded
- **THEN** each entry behaves exactly as before as a recipe-kind loop

### Requirement: Ordered stop conditions including needs-human escalation

The system SHALL evaluate stop conditions for an active loop in this order
when the agent's turn completes: (1) the run errored → resolve `error`; (2)
the last assistant message contains the `NEEDS_HUMAN:` marker → resolve
`escalate`; (3) the last assistant message contains a deny-listed term →
resolve `escalate`; (4) sentinel handling by kind — for a **recipe** loop a
sentinel match resolves `done`; for a **goal** loop the sentinel/verification
state machine applies (see the goal-loop requirement); (5) the iteration cap
is reached → resolve `capped`, checked before any send including a
verification send; otherwise resend. All matching SHALL be deterministic
string matching. Every resolution SHALL deactivate the loop so it no longer
ticks.

#### Scenario: Sentinel stops a recipe loop as done

- **WHEN** a recipe-looping agent's last message contains the loop's sentinel phrase
- **THEN** the loop resolves `done` and no further prompt is sent

#### Scenario: NEEDS_HUMAN escalates before sentinel handling

- **WHEN** a looping agent's last message contains both `NEEDS_HUMAN:` and the sentinel phrase
- **THEN** the loop resolves `escalate` and no further prompt is sent

#### Scenario: Cap refuses to over-run even into verification

- **WHEN** a goal-looping agent claims done but the iteration counter has reached the loop's cap
- **THEN** the loop resolves `capped` and no verification prompt is sent

### Requirement: Loop status is readable without the operator gate

The system SHALL expose a read-only loop-status projection (per-repo loop
state, kind, mode, phase, iteration count, terminal status, stop reason/detail,
recipe names) behind normal session auth but NOT behind the operator gate, so
dashboard surfaces can show a loop's outcome after the gate is closed. This
projection SHALL disclose loop status only — no prompt text, no goal text, no
autopilot configuration, and no action surface — with one exception: a
suggest-mode instance's current pending prompt SHALL be included ONLY while
the operator gate is open (with the gate closed the engine is idle, produces
no pending prompts, and the projection carries none).

#### Scenario: Terminal state visible after the gate closes

- **WHEN** a loop resolved `escalate` and the operator gate has since been closed
- **THEN** an authenticated client can still read that loop's kind, terminal state, and stop reason

#### Scenario: Goal text is not status

- **WHEN** an authenticated client reads the projection for a repo with a goal loop
- **THEN** the response carries the loop's kind and phase but no goal or prompt text

## ADDED Requirements

### Requirement: Goal loop drives toward a stated goal and verifies before done

The system SHALL support arming a goal loop from a free-text goal statement.
At arm time the server SHALL compose, from fixed templates, a work prompt
(goal + the looped-agent output contract) and a verification prompt (goal + an
instruction to critically verify against the actual repository state and end
with `GOAL_VERIFIED` only if genuinely achieved), and SHALL store both
verbatim — the engine sends only the stored text. While in the work phase, a
sentinel done-claim SHALL NOT resolve the loop; it SHALL send the verification
prompt and enter the verify phase (counting an iteration and auditing the
send). In the verify phase, `GOAL_VERIFIED` in the last assistant message
SHALL resolve the loop `done` with a stop reason recording that it was
verified; any other reply SHALL return the loop to the work phase and resend
the work prompt. A `GOAL_VERIFIED` token appearing during the work phase SHALL
have no effect.

#### Scenario: Done-claim triggers verification instead of stopping

- **WHEN** a goal loop in the work phase sees the agent end its reply with the sentinel done-claim
- **THEN** the verification prompt is sent, the loop enters the verify phase, and the loop is not resolved

#### Scenario: Verified confirmation stops the loop

- **WHEN** a goal loop in the verify phase sees `GOAL_VERIFIED` in the agent's reply
- **THEN** the loop resolves `done` with a stop reason recording verification

#### Scenario: Failed verification feeds the next work turn

- **WHEN** a goal loop in the verify phase sees a reply without `GOAL_VERIFIED` or a needs-human marker
- **THEN** the loop returns to the work phase and resends the stored work prompt

#### Scenario: Premature token cannot skip verification

- **WHEN** a goal loop in the work phase sees `GOAL_VERIFIED` but no sentinel done-claim
- **THEN** the loop treats the turn as ordinary work and resends the work prompt

### Requirement: Autopilot arming is exclusive per agent

The system SHALL represent every autopilot mode — suggestion, recipe loop, or
goal loop — as a single per-agent **loop instance** in one store, so that at
most one mode is armed per repo **by construction**: arming any mode SHALL
replace the agent's loop instance (resolving a displaced active instance as
user-stopped), and a single disarm action SHALL clear whichever mode is armed.
The engine's runtime rule (only the agent's one active instance is acted on)
SHALL remain as defense-in-depth.

#### Scenario: Arming a loop displaces suggestion arming

- **WHEN** a repo is suggestion-armed and the user arms a goal loop on it
- **THEN** the repo is no longer suggestion-armed and the goal loop is active

#### Scenario: Arming suggestions stops an active loop

- **WHEN** a repo has an active recipe loop and the user arms the suggestion mode on it
- **THEN** the loop is resolved as user-stopped and the repo is suggestion-armed

#### Scenario: One disarm clears the armed mode

- **WHEN** the user disarms a repo that has any autopilot mode armed
- **THEN** no autopilot mode remains armed on that repo after the single action

### Requirement: Every autopilot mode is a loop implementation behind one interface

The system SHALL model the autopilot modes as implementations of one loop
interface: each kind (suggestion, recipe, goal) SHALL expose its kind name and
a decision function that, given the agent's trailing state, yields exactly one
of — hold (stay armed, surface a reason), stop (terminal status with reason
and detail), or propose (the next prompt for this agent). The engine SHALL
contain no kind-specific branching beyond dispatching to the instance's
implementation; sending, pending-prompt recording, cap enforcement, dedup, and
auditing SHALL be shared mechanics applied uniformly to every kind's
decisions.

#### Scenario: A kind's semantics live in its implementation

- **WHEN** a recipe loop and a goal loop are active on different agents
- **THEN** the same engine flow drives both, and only their implementations' decisions differ

#### Scenario: Suggestion is a loop like the others

- **WHEN** a repo is armed for suggestions
- **THEN** its arming, status, and decisions flow through the same loop instance model, store, and projection as recipe and goal loops

### Requirement: Every loop has a suggest-or-drive mode

The system SHALL give every loop instance a mode — `suggest` or `drive` —
governing what happens to a proposed next prompt: in `drive` mode the engine
SHALL send it to the agent (capped and audited as today); in `suggest` mode
the engine SHALL NOT send, and SHALL instead record it as the instance's
pending prompt so the agent's composer can be pre-filled for the human to
send. The mode SHALL be flippable on a live instance without resetting its
counters. The iteration cap SHALL bound drive-mode sends only; suggestion-kind
instances SHALL default to uncapped.

#### Scenario: Suggest mode pre-fills instead of sending

- **WHEN** a recipe loop in suggest mode sees the agent's turn complete without a stop condition
- **THEN** the stored prompt becomes the pending prompt, nothing is sent, and the iteration counter does not advance

#### Scenario: Flipping mode mid-loop

- **WHEN** the user flips an active goal loop from drive to suggest
- **THEN** the loop keeps its kind, prompts, phase, and counters, and from the next decision on only pre-fills

### Requirement: Gated loop detail discloses the exact prompts

The system SHALL expose, behind the operator gate, a read-only loop detail
projection carrying each loop's full stored prompts (recipe prompt, or goal
text with the composed work and verification prompts and current phase), the
full recipe bodies, and the goal-loop composition templates — so a client can
show byte-identical previews of what the engine will send before and after
arming. While the gate is closed this read SHALL be refused with the explicit
gate-closed error like every other prompt-level disclosure.

#### Scenario: Inspection shows what will be sent

- **WHEN** the operator gate is open and a client reads the loop detail for a repo with an armed goal loop
- **THEN** the response contains the stored work and verification prompts byte-identical to what the engine sends

#### Scenario: Gate closed refuses prompt-level detail

- **WHEN** the operator gate is closed and a client requests loop detail
- **THEN** the request is refused with the explicit gate-closed error and no prompt text is returned
