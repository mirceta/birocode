## ADDED Requirements

### Requirement: Several arch conversations, each with its own loop space
The harness SHALL keep any number of arch conversations. The default SHALL keep the
reserved id `@arch`; further conversations SHALL be keyed `@arch:<id>` and SHALL be
created, renamed and removed through `/api/arch/conversations` (the default SHALL NOT be
removable). Every conversation SHALL run in the same home repo with the same tools and
the same managed scope, and SHALL have its own run slot, loop slot, session and collector
watermark, so two armed conversations each see every managed repo turn once. The arch
endpoints (state, messages, tool-calls, send, stream, stop-turn, loop) SHALL take a
`conv` parameter that defaults to the default conversation and answers 404 for an
unknown one; the autopilot loop endpoints SHALL accept any conversation key as the
repoId. An arch state file written before conversations SHALL be read as the default
conversation, and the default's fields SHALL stay mirrored at the top level on save.

#### Scenario: Two conversations, two loops
- **WHEN** the operator arms a standing wake loop on "Deploy train" and a goal loop on the default conversation
- **THEN** each has its own active loop instance, a managed repo's turn wakes both, and disarming one leaves the other armed

#### Scenario: Unknown conversation
- **WHEN** a client asks `GET /api/arch?conv=@arch:nope`
- **THEN** the reply is 404 and nothing is created

#### Scenario: Legacy state file
- **WHEN** the harness starts on an `arch.json` with a top-level watermark and last session id but no conversations
- **THEN** the default conversation carries that watermark and session, and the list holds only the default

### Requirement: The Arch tab holds the loops, side by side lanes and the conversation name
The Arch tab SHALL show a **Loops** lane per conversation holding that conversation's
standing wake loop card and driven loop (goal · recipe) control; the fleet-wide cards
(Managed agents, Fleet, Home repo) SHALL stay in the side column, the Fleet lane and the
Status tab's cards view, which SHALL no longer show loop cards. A **split** toggle SHALL
show up to three lanes side by side inside the tab, picked with the lane chips, with the
chat column keeping its composer; the choice SHALL persist per device. The conversation's
name SHALL be editable at the top of the tab and a non-default conversation SHALL be
removable there.

#### Scenario: Chat beside the tool-call history
- **WHEN** the operator turns the split on
- **THEN** the chat and the tool-call history render as two columns, a further chip adds a third column, and a reload keeps the columns

#### Scenario: Loops per conversation
- **WHEN** the operator opens the Loops lane of "Deploy train"
- **THEN** the standing wake loop and the driven loop control shown are that conversation's, and arming there does not arm the default conversation
