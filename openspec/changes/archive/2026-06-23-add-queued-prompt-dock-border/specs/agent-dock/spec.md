# agent-dock

## ADDED Requirements

### Requirement: Thick black border on dock tiles with queued prompts

The system SHALL render an agent's dock tile with a thick black border whenever that agent has
one or more queued prompts (a non-empty per-agent prompt stash). The border SHALL be visibly
thicker than the tile's default border, and SHALL be applied on every dock surface that
represents an agent as a tile — the dashboard's live phones and its summary cards, and the
Agents list — so the operator can identify agents with queued work at a glance. When the
agent's queue returns to empty, the tile SHALL revert to its normal border.

#### Scenario: An agent gains a queued prompt

- **WHEN** an agent that had no queued prompts has a prompt added to its queue
- **THEN** that agent's dock tile is drawn with the thick black border on every surface where the tile appears

#### Scenario: The queue empties

- **WHEN** the last queued prompt for an agent is sent or removed
- **THEN** that agent's dock tile reverts to its normal (non-black, default-thickness) border

#### Scenario: An agent with no queued prompts is unaffected

- **WHEN** an agent has an empty queue
- **THEN** its dock tile keeps its normal border and shows no black border

### Requirement: Queued border takes precedence over other border states

The system SHALL give the queued-prompt black border visual precedence over the tile's other
color-coded border states (active, recency, colored-agent, and the important border) while
prompts are queued, so the queued signal is not hidden by another border state. A state drawn
by a different mechanism than the border (such as a layered glow) MAY remain visible alongside
the black border.

#### Scenario: Queued and important at once

- **WHEN** an agent is both marked important and has one or more queued prompts
- **THEN** its dock tile shows the thick black queued border (taking precedence over the important border)

### Requirement: The queued border honors the dock's Advanced gate

The system SHALL show the queued-prompt border only where the agent dock itself is shown —
behind the same Advanced-mode gate as the dashboard / agent dock and the prompt-stash feature —
so Basic mode is unaffected.

#### Scenario: Basic mode shows no dock and no border

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** neither the agent dock nor the queued-prompt border is shown
