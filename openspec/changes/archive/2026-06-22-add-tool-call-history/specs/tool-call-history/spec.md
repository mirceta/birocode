# Tool-call history

## ADDED Requirements

### Requirement: List the tool calls of the active conversation

The system SHALL provide, for the currently active conversation, a consolidated
chronological list of the tool calls the agent has made (e.g. Bash, Read, Edit, Grep),
presented separately from the interleaved message/prose stream. Each entry SHALL show
the tool name, a short summary of its input, a status indicator (success / error /
running), and a timestamp, and SHALL be expandable to reveal the full input and output.

#### Scenario: View the tool-call list

- **WHEN** the End User opens the tool-call history for the active conversation
- **THEN** every tool call the agent has made in that conversation is listed in the order it occurred, each showing name, input summary, status, and time

#### Scenario: Expand a tool call

- **WHEN** the End User expands a listed tool call
- **THEN** the full input and the tool's output are shown for that call

#### Scenario: List updates as the agent works

- **WHEN** the agent makes new tool calls while a turn is streaming
- **THEN** the new calls appear in the list without requiring a reload

### Requirement: Tool-call history is durable across reload and reattach

The system SHALL reconstruct the tool-call history of a conversation from the session
transcript on the backend, so the list is complete after a page reload and when
reattaching to a session whose turn is already in progress — not only while events
stream live. Reconstruction SHALL pair each tool invocation with its result and SHALL
tolerate a malformed or incomplete transcript entry by skipping it rather than failing.

#### Scenario: History survives a reload

- **WHEN** the agent has made tool calls and the End User reloads the web UI and reopens the tool-call history
- **THEN** the previously made tool calls are still listed with their results

#### Scenario: History is available on reattach

- **WHEN** the End User reattaches to a conversation whose turn was started elsewhere
- **THEN** the tool calls already made in that turn are listed, not just those that arrive after reattaching

#### Scenario: A call without a recorded result

- **WHEN** a tool invocation has no matching result in the transcript (e.g. still running or truncated)
- **THEN** the call is still listed, marked as having no result, and the rest of the list renders normally

### Requirement: Tool-call history respects the Advanced-mode gate

The system SHALL expose the tool-call history (its toggle and panel) only in
Advanced mode, behind a dedicated capability gate, so Basic (Simple) mode does not
show it.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the tool-call history toggle and panel are not shown

#### Scenario: Available in Advanced mode

- **WHEN** the web UI is in Advanced mode
- **THEN** the tool-call history toggle is available in the chat view and opens the list
