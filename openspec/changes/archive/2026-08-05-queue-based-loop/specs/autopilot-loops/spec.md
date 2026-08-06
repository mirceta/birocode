# autopilot-loops — delta for queue-based-loop

## ADDED Requirements

### Requirement: A queue loop unloads the tab's live stash one prompt per turn

The system SHALL support arming an agent's one loop slot with a **queue loop**
bound to that agent's tab prompt stash — the stash itself is the queue, not a
copy. Each time the driven agent's turn ends (and verification, when enabled,
has passed), the engine SHALL take the stash's **head** item and dispatch it by
the instance's mode — sent in drive mode, pended into the agent's composer in
suggest mode — removing the item from the stash only once it lands (send
completed, or pend consumed by the human). The stash SHALL remain live while
armed: items added, removed, or reordered while the queue runs take effect on
the next unload. When the stash is empty at an unload point, the loop SHALL
resolve `done` with stop reason `drained`. A `LOOP_DONE` token in a step reply
SHALL NOT complete the queue.

#### Scenario: Drive-mode queue drains head-first in stash order

- **WHEN** a queue loop is armed in drive mode on a stash holding ["A", "B", "C"] and the agent finishes each turn without escalation
- **THEN** the engine sends A, then B, then C, one per unload point, each removed from the stash as it lands, and after C the loop resolves done with reason drained

#### Scenario: An item stashed while the queue runs gets unloaded

- **WHEN** the operator stashes a new prompt while the queue loop is armed and running
- **THEN** the new item joins the stash in order and is unloaded when its turn comes, without re-arming

#### Scenario: Suggest-mode queue pends instead of sending

- **WHEN** a queue loop is armed in suggest mode and an unload point is reached
- **THEN** the head item becomes the instance's pending prompt pre-filling the composer, nothing is sent, and the item leaves the stash only after the human sends it

#### Scenario: An agent's LOOP_DONE does not end the queue

- **WHEN** a step reply ends with LOOP_DONE while the stash still holds items
- **THEN** the queue proceeds to the next item at the next unload point instead of resolving done

### Requirement: Queue sends ride the standard driven-loop mechanics unchanged

Queue loop unloads SHALL pass through the driven kinds' shared safety ladder — a
run error stops as `error`; a `NEEDS_HUMAN:` marker stops as `escalate` naming
the question; a deny-listed term in the reply stops as `escalate` naming the
term — before any next item is unloaded. Drive-mode queue sends (verification
turns included) SHALL be bounded by the instance's iteration cap (resolving
`capped` when reached), recorded in the append-only audit trail, and fenced by
the operator gate and kill switch, identically to the recipe and goal kinds.

#### Scenario: NEEDS_HUMAN mid-queue stops and escalates

- **WHEN** a step reply contains NEEDS_HUMAN: with a question while the stash still holds items
- **THEN** the loop resolves escalate with reason needs-human quoting the question, and no further item is unloaded

#### Scenario: Cap bounds a runaway queue

- **WHEN** a drive-mode queue loop reaches its iteration cap with items remaining
- **THEN** the loop resolves capped and sends nothing further

### Requirement: Between-step verification is on by default and stops a broken ritual

A queue loop SHALL verify each step by default: unless the operator opts out at
arm time, after an unloaded step's turn ends the engine SHALL send a
verification prompt composed at send time from the stored verification template
and that step's text, asking whether the step's request was genuinely
accomplished. Only a verification reply whose final non-empty line contains
`STEP_VERIFIED` SHALL unload the next item. Any other verification reply — a
question, a blocker, a partial result — SHALL resolve the loop `escalate` with
stop reason `step-unverified` quoting the reply: the queue SHALL NOT unload the
next item into an unresolved step. The step text under verification SHALL be
stored on the loop record when it lands, so verification survives a restart.
When verification is opted out, no verification turn SHALL be sent.

#### Scenario: Verified step advances the queue

- **WHEN** verification is enabled and a step's verification reply ends with STEP_VERIFIED
- **THEN** the next stash item is unloaded at the following unload point

#### Scenario: Unverified step escalates instead of continuing

- **WHEN** verification is enabled and a step's verification reply does not end with STEP_VERIFIED
- **THEN** the loop resolves escalate with reason step-unverified quoting the reply, and the next item is never unloaded

#### Scenario: Verification defaults on

- **WHEN** the operator arms a queue loop without touching the verification setting
- **THEN** verification turns are sent between steps

#### Scenario: Opt-out means no verification turns

- **WHEN** the operator arms a queue loop with verification opted out and a step's turn ends
- **THEN** the next item is unloaded directly with no verification prompt in between

### Requirement: Stopping a queue is lossless and re-arm resumes it

Any queue stop SHALL leave all unsent items in the tab's stash unchanged —
escalation, cap, error, and operator disarm alike — because the stash only
loses items that actually landed. Re-arming a queue loop on the same tab SHALL resume
unloading from the stash head. This SHALL be the supported way to converse with
the agent between queue items: stop (or let verification stop), chat, re-arm.

#### Scenario: Disarm mid-queue keeps the remaining items

- **WHEN** the operator disarms a running queue loop with items still in the stash
- **THEN** the stash still holds every unsent item in order

#### Scenario: Re-arm continues where the queue left off

- **WHEN** a queue loop stopped mid-stash and the operator, after exchanging manual prompts with the agent, arms a new queue loop on the same tab
- **THEN** unloading resumes from the current stash head

### Requirement: The dock and the console arm and disclose the queue loop

The dock's unified loop control SHALL offer the queue kind beside the existing
kinds — settings (mode, cap, verification), a next-up preview, and the
remaining count; the stash strip remains the queue's editor. The autopilot
console's Loops section SHALL gain a Queue tab presenting per-agent queue
status, the same settings, and arm/disarm. Arming SHALL require a non-empty
stash, and exclusive-per-agent arming with one Disarm is unchanged. The ungated
loop status projection SHALL include the queue's progress as counts and phase
only (items remaining, items sent, verify phase); item texts, the last-sent
step text, and the verification template SHALL be disclosed only while the
operator gate is open, following the existing disclosure rule.

#### Scenario: Arm a queue from the dock

- **WHEN** the operator picks the queue kind in an agent's loop control and arms it over a non-empty stash
- **THEN** the agent's one loop slot holds the queue loop bound to that tab's stash, and the dock badge shows its typed armed state with remaining/sent progress

#### Scenario: Arming an empty stash is refused

- **WHEN** the operator attempts to arm a queue loop while the tab's stash is empty
- **THEN** the arm is rejected with a clear error and no loop is armed

#### Scenario: Gate closed discloses progress but not prompts

- **WHEN** the operator gate is closed and a client reads the loop status projection for an armed queue loop
- **THEN** the remaining and sent counts and phase are present but no item text is disclosed
