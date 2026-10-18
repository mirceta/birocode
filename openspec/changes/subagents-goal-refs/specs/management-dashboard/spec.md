## ADDED Requirements

### Requirement: Goal conversations carry a copyable reference
Every goal row in the Subagents tab and the selected goal's header SHALL show the goal's id as a reference chip in the Kanban #ref style; clicking it SHALL copy the id, and its tooltip SHALL carry the full conversation id and the goal's first line.

#### Scenario: Copying a goal's reference
- **WHEN** the Operator clicks a goal row's reference chip
- **THEN** the goal's id is on the clipboard and the chip confirms it was copied

### Requirement: A goal can be mentioned in the Arch chat
A "mention" action on a goal row and on the selected goal's header SHALL switch to the Arch tab and insert "goal <id> (<short title>)" into the Operator-facing composer at the caret, focused, without sending; the header SHALL offer the same for the goal's board tasks ("task <id> (<title>)") and the agents it drives (their handle).

#### Scenario: Mention and continue the sentence
- **WHEN** the Operator presses mention on a goal and types "— add a step: verify it on the hub"
- **THEN** the Arch composer holds "goal <id> (<title>) — add a step: verify it on the hub" and nothing has been sent

### Requirement: Goal ids in the Arch chat open the goal
In arch conversations every "goal <id>" — the finished-goal summary, the arch's replies, NEEDS_HUMAN questions — SHALL render as a chip that opens that goal in the Subagents tab.

#### Scenario: Opening a goal from its summary
- **WHEN** a finished goal's summary says "goal 84495326 done" and the Operator clicks the chip
- **THEN** the Subagents tab opens with that goal's conversation selected

### Requirement: The goal list filters to what is active
The Subagents selector SHALL offer an Active | All toggle, default Active, remembered per browser: Active lists goals that are running or held, anything busy or blocked, and anything with activity within the last hour; All lists every goal conversation and its toggle shows how many Active hides; the Subagents tab's badge SHALL count the Active set.

#### Scenario: Old finished goals are hidden
- **WHEN** a goal finished two days ago and another is running
- **THEN** Active lists only the running one, All says "1 more" and lists both, and the badge says 1

### Requirement: Prompts can name a goal
A {goal} placeholder in a cached prompt SHALL offer the live goals as its choices (running and held first), the way {task} and {agent} offer cards and agents.

#### Scenario: Filling a goal placeholder
- **WHEN** the composer holds "Continue goal {goal} with cap 5"
- **THEN** the goal chip offers the live goals by id, the running ones first
