# operator-message-history Specification

## Purpose
TBD - created by archiving change add-operator-message-history. Update Purpose after archive.
## Requirements
### Requirement: Operator-messages aggregation button

The chat toolbar SHALL present an "Operator messages" button beside the existing "Tool
calls" button. Pressing it SHALL open a panel that renders every message sent by the
operator (the `user` role) in the active conversation, in the same overlay style the
tool-calls panel uses. The button SHALL be available only in Advanced UI mode,
consistent with the tool-calls button, and SHALL toggle the panel open and closed.

#### Scenario: Button appears beside Tool calls in Advanced mode

- **WHEN** the chat is viewed in Advanced UI mode
- **THEN** an "Operator messages" button is shown in the chat toolbar next to the "Tool calls" button
- **AND WHEN** the chat is viewed in Basic UI mode
- **THEN** the "Operator messages" button is not shown

#### Scenario: Pressing the button opens the operator-messages panel

- **WHEN** the operator presses the "Operator messages" button
- **THEN** a panel opens over the message area listing the operator messages of the active conversation
- **AND WHEN** the button is pressed again
- **THEN** the panel closes

### Requirement: Operator-message contents and count

The panel SHALL list exactly the active conversation's `user`-role messages, in
conversation order, excluding assistant and tool content, and SHALL show a count of how
many operator messages were found. When the conversation contains no operator messages,
the panel SHALL show an explicit empty state rather than an empty list.

#### Scenario: Lists only operator messages with a count

- **WHEN** the operator-messages panel is open for a conversation containing operator and assistant messages
- **THEN** only the operator (`user`-role) messages are listed, in order
- **AND** a count of the listed operator messages is shown in the panel header

#### Scenario: Empty state when there are no operator messages

- **WHEN** the panel is opened for a conversation with no operator messages
- **THEN** an explicit empty-state message is shown instead of an empty list

### Requirement: One aggregation panel at a time

The operator-messages panel and the tool-calls panel SHALL be mutually exclusive, since
both overlay the message area. Opening one SHALL close the other.

#### Scenario: Opening operator messages closes tool calls

- **WHEN** the tool-calls panel is open and the operator presses the "Operator messages" button
- **THEN** the operator-messages panel opens and the tool-calls panel closes

