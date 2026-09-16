## ADDED Requirements

### Requirement: The policeman is a reserved arch conversation driven by a forever loop
The harness SHALL provide a reserved arch conversation `@arch:policeman` ("👮 Policeman"),
created on first start with a fixed id and name, not renamable or removable from the Arch
page, and not listed as a sibling tab where the Kanban hosts it. Starting the policeman
SHALL arm the engine's recipe loop on that conversation with ONE fixed prompt — check that
the Kanban is honest against the board goal — re-sent every interval (default 5 minutes,
settable), with a sentinel the prompt forbids. The harness SHALL keep that loop alive: it
SHALL re-arm it when the recipe cap is reached and after an errored turn once a cooldown
has passed, and SHALL NOT re-arm it while it waits for the Operator's answer or after the
Operator stopped it. The Operator SHALL be able to start, stop, run one pass now, change
the interval and the context cap, and talk to the conversation like any arch conversation.

#### Scenario: Start
- **WHEN** the Operator presses ▶ Start on the Kanban's Policeman subtab
- **THEN** the conversation exists, its recipe loop is armed with the ritual prompt, the first pass runs, and the strip shows "armed"

#### Scenario: The recipe cap is reached
- **WHEN** the loop resolves `capped` after its hundredth pass
- **THEN** the next engine tick re-arms it and the strip counts one auto re-arm

#### Scenario: The Operator stops it from the loops lane
- **WHEN** the Operator stops the loop in the conversation's Loops lane
- **THEN** the policeman is disabled and no tick re-arms it until ▶ Start

### Requirement: The policeman observes, verifies and flags — never acts
For the policeman conversation the harness MCP server SHALL refuse every mutating tool
(send_task, dispatch_task, update_task, assign_task, create_task, delete_task,
idea_to_task, adopt_branch, upgrade_peer, start/update/stop_loop, start/stop_arch_goal)
with status `policeman-observe-only` and the reason, before it runs. It SHALL offer
`board_integrity` (the live verdict from the recorded facts, every card carrying a human
request, the board goal), `flag_needs_human` (stamps by the policeman; refused on a manual
card; never overwrites another raiser's request) and `clear_needs_human` (withdraws only
the policeman's own stamps), alongside the read-only tools.

#### Scenario: It tries to dispatch
- **WHEN** the policeman calls dispatch_task on a card
- **THEN** the call answers `policeman-observe-only` without sending anything, and the refusal is in its tool-call history

#### Scenario: It flags a stuck assignee
- **WHEN** the policeman calls flag_needs_human with a reason on a non-manual card without a request
- **THEN** the card carries "human assistance requested" by the policeman with that reason and the Kanban shows the 🆘 badge

### Requirement: The policeman's context is capped and rolled over without losing the thread
The harness SHALL record the CLI's reported context size after every policeman turn and,
when it reaches the context cap (default 400,000 tokens, settable) or a turn-count
fallback, SHALL roll the conversation over: close the current session in a sessions list
with the reason, start the next prompt in a fresh CLI session, and prefix that prompt with
a mechanical handover — which session ended and why, the board's verdict now, and every
card carrying a human request. Every past session SHALL stay listed with its turns,
context size and reason, and its tool calls SHALL remain readable by session id. The
Operator SHALL be able to roll over by hand.

#### Scenario: The cap is reached
- **WHEN** a policeman turn ends with a reported context of 400,000 tokens or more
- **THEN** the sessions strip shows that session ended "its context reached … tokens", the next pass runs in a new session whose first prompt starts with the handover, and clicking the old session shows its tool calls

#### Scenario: No usage is reported
- **WHEN** the CLI reports no usage figures for 400 turns of one session
- **THEN** the harness rolls over on the turn count instead
