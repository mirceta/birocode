# autopilot-loops — delta

Fixes the conversation-identity break found in the first capped goal-loop
post-mortem: the engine judged and drove whatever transcript file was newest,
so concurrent sessions fed, advanced, and resolved a loop that was supposed to
drive one conversation.

## ADDED Requirements

### Requirement: A driven loop is pinned to one conversation

A DRIVEN loop instance (recipe, goal) SHALL carry the session id of the one
conversation it drives. Arming SHALL pin it: to the session id supplied by the
arming client when present, otherwise to the repo's newest transcript session
resolved once at arm time. The engine SHALL read "the agent's reply" from the
pinned session only and SHALL resume the pinned session only when sending; a
message in any other session for the repo SHALL NOT advance, feed, or resolve
the loop. The suggestion kind's act-on-current-trailing-message behavior is
unchanged.

#### Scenario: Concurrent unrelated session cannot resolve the loop

- **WHEN** a driven loop is pinned to conversation A and a different session B in the same repo (for example a background job) writes a newer transcript whose last message contains the loop's sentinel
- **THEN** the loop's next decision is still based on conversation A's last reply, and the loop neither stops as done nor sends against session B

#### Scenario: Arming from the dock pins the open conversation

- **WHEN** the user arms a driven loop from a dock whose chat shows a conversation with a known session id
- **THEN** the loop record stores that session id and the loop's first send resumes that conversation

### Requirement: The pin follows the conversation's lineage across resumes

Because resuming a session produces a new session id, the system SHALL advance
a driven loop's pinned session id whenever a builder-lane run for the loop's
repo completes with a captured session id — whether the run was started by the
engine or by the human (for example sending a suggest-mode pending prompt from
the composer). Runs outside the builder lane, and background jobs that do not
run through the run-session registry, SHALL NOT move the pin.

#### Scenario: Loop follows its own resume fork

- **WHEN** a driven loop sends its prompt by resuming pinned session A and the run completes having forked to new session id B
- **THEN** the loop's pin becomes B and the next decision reads B's last reply

#### Scenario: Human-sent turn advances a suggest-mode loop

- **WHEN** a driven loop in suggest mode has a pending prompt and the human sends it from the composer, completing a builder-lane run with new session id C
- **THEN** the pin becomes C and the loop's next decision is based on that reply

### Requirement: Completion tokens count only on the reply's final line

The engine SHALL treat a loop's sentinel (for example LOOP_DONE) and the goal
loop's GOAL_VERIFIED token as present only when the token appears on the final
non-empty line of the agent's reply, matching the loop-driven-agent convention
("end your reply with the token as the final line"). A reply that mentions or
quotes a token elsewhere SHALL NOT complete a loop or enter verification. The
NEEDS_HUMAN marker and deny-list terms remain whole-reply matches (their
failure direction is a safe stop-and-ask).

#### Scenario: Quoted sentinel does not complete the loop

- **WHEN** the pinned conversation's reply discusses the loop's mechanism and quotes "LOOP_DONE" mid-text but does not end with it
- **THEN** the loop does not resolve done (recipe) or enter the verify phase (goal), and the loop proposes its stored prompt as usual

#### Scenario: Final-line sentinel still completes

- **WHEN** the pinned conversation's reply ends with the sentinel as its final non-empty line
- **THEN** the recipe loop resolves done (or the goal loop enters verification) exactly as before
