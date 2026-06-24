## ADDED Requirements

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
