# agent-dock Specification

## Purpose
TBD - created by archiving change add-queued-prompt-dock-border. Update Purpose after archive.
## Requirements
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

### Requirement: Maximize chat to fill the dock

The system SHALL let the operator collapse an agent dock's non-chat chrome — the phone
bar/header, the lane switcher (Builder/Ask/Files), the local-apps switcher, the git-status
block, and the discover-local-apps block — so that the chat (message list and composer) fills
the dock's full vertical space. This SHALL be controlled by a single toggle button placed in the
chat toolbar immediately next to the existing Tool Calls button. The same button SHALL both
maximize and restore: pressing it when the dock is in its normal layout maximizes the chat, and
pressing it again restores the dock to its previous (normal) layout. The button SHALL convey its
current state (pressed/active when maximized) and SHALL carry an accessible label.

#### Scenario: Maximize the chat

- **WHEN** the operator presses the maximize-chat button on a dock that is showing its normal layout
- **THEN** the dock hides its non-chat chrome and the chat fills the dock's full vertical space, and the button shows its active (pressed) state

#### Scenario: Restore the previous layout

- **WHEN** the operator presses the maximize-chat button on a dock whose chat is currently maximized
- **THEN** the dock restores its previous normal layout with the non-chat chrome shown again, and the button returns to its inactive state

#### Scenario: The composer and chat toolbar stay usable when maximized

- **WHEN** the chat is maximized
- **THEN** the chat toolbar (including the maximize-chat and Tool Calls buttons) and the composer remain visible and usable, so the operator can still type, open tool calls, and un-maximize

### Requirement: Maximize state is per-dock and ephemeral

The system SHALL track the maximized state independently for each agent dock, so maximizing one
dock does not affect any other dock. This state SHALL be ephemeral client-side UI state: it is
not persisted and SHALL reset to the normal layout when the web UI is reloaded.

#### Scenario: One dock maximized does not affect others

- **WHEN** the operator maximizes the chat in one agent dock while other docks are visible
- **THEN** only that dock collapses its chrome; the other docks keep their normal layout

#### Scenario: State resets on reload

- **WHEN** a dock's chat is maximized and the operator reloads the web UI
- **THEN** the dock comes back in its normal (non-maximized) layout

### Requirement: Maximize toggle respects the Advanced-mode gate

The system SHALL expose the maximize-chat toggle only in Advanced mode — behind the same gate as
the agent dock and the tool-call-history toggle it sits beside — so Basic (Simple) mode does not
show it.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the maximize-chat toggle is not shown

#### Scenario: Available in Advanced mode

- **WHEN** the web UI is in Advanced mode
- **THEN** the maximize-chat toggle is available in the agent dock's chat toolbar next to the Tool Calls button

