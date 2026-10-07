## ADDED Requirements

### Requirement: A goal conversation carries a step plan

A goal SHALL carry an ordered STEP PLAN — steps with a title, a one-line "what proves it",
a kind (`send | wait | transfer | verify | relay-loop | human | other`) and a state
(`pending | active | done | blocked | skipped`), each with an optional note, evidence (free
text or hub path + size, transfer job id, the agent's closing line, a commit / PR URL) and,
for relay-loop steps, a counter of questions relayed. `start_arch_goal` and the Operator's
start SHALL accept the plan as `steps`; without it the harness SHALL derive a plan from
numbered / "STEP n —" lines of the goal text and mark it derived. The plan SHALL be editable
while the goal runs (`edit_goal_plan`: set, add, rename, remove, move). `list_arch_goals`
SHALL return the plan with states, progress, the active step and the blocked count;
`stop_arch_goal` SHALL keep the plan for the record.

#### Scenario: Declared and derived plans

- **WHEN** a goal starts with `steps` of four entries
- **THEN** its plan has four pending steps and is not derived
- **WHEN** a goal starts without `steps` and its text has lines "STEP 1 — …", "STEP 2 — …"
- **THEN** its plan has those steps, marked derived, and the work prompt says so

### Requirement: The arch marks its steps; the harness blocks on NEEDS_HUMAN

`mark_step(goalId?, step, state, note?, evidence?, counter?)` SHALL be honoured only from the
goal conversation that owns the goal (`not-owner` otherwise) and from the Operator's UI.
Exactly one step SHALL be active at a time unless a relay-loop step runs; a relay-loop step
marked active again SHALL count one more relay. Every work send of the goal loop SHALL carry
the plan with its states and evidence and the rule that a done step is done (its brief is
never re-sent); the verification send SHALL carry the plan to verify against. When the goal
conversation ends a turn with NEEDS_HUMAN the harness SHALL block the active step (else the
first pending one, else a new human step) awaiting the Operator with the question as its
note, and the goal SHALL be HELD — running, loop escalated, agents kept — until the
Operator's answer, which SHALL clear the block and resume the goal loop in place.

#### Scenario: One active step, evidence on done

- **WHEN** the arch marks step 2 active while step 1 is active, then marks step 1 done with the agent's closing line
- **THEN** step 1 is pending-then-done with that evidence, step 2 is the only active step, and the next work send lists "1. ✓ … 2. ▶ …" with 1/n done

#### Scenario: NEEDS_HUMAN holds and the answer resumes

- **WHEN** the goal conversation ends with `NEEDS_HUMAN: which DB?`
- **THEN** the active step is blocked awaiting the Operator with "which DB?" as its note, the goal stays running and not busy (held), its agents stay driven, and no summary is posted
- **WHEN** the Operator answers (the composer or the plan panel)
- **THEN** the step is active again, the goal loop is armed again with its budget restarted, and the answer is the conversation's next turn

### Requirement: A goal can be continued from its plan

`start_arch_goal(continuesGoalId)` (and the Operator's Continue) SHALL start a new goal on an
ENDED goal's text, agents and tasks with its plan carried over — done and skipped steps keep
their state and evidence, active and blocked ones go back to pending — and the work sends
SHALL name the continued goal and its done steps so no brief is sent twice; a goal that still
runs SHALL be refused as owned.

#### Scenario: Continue after a cap

- **WHEN** goal A capped with steps 1–2 done and 3 active, and the Operator continues it
- **THEN** goal B starts with 1–2 done (evidence kept), 3–n pending, `continuesGoalId = A`, and its first work send says steps 1–2 were done in A

### Requirement: The summary is written from the plan

The finished-goal summary posted to the Operator-facing conversation SHALL list the plan's
steps with their states and evidence beside the goal's outcome and the conversation's last
reply.

#### Scenario: Summary lines

- **WHEN** a goal with a 3-step plan resolves done
- **THEN** the summary message carries "Step plan (3/3 done)" and one line per step with its evidence
