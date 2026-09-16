## ADDED Requirements

### Requirement: The arch conversation is windowed like a repo-agent dock

Every arch conversation surface — the Operator-facing default conversation and each
goal conversation — SHALL render only the most recent window of messages by default,
the same window size the repo-agent dock uses, and SHALL offer the dock's "Show earlier
messages (N)" control that reveals older messages in the dock's chunk size while
keeping the reader's position. The page SHALL fetch only that window from the harness
(`GET /api/arch/messages?tail=N`, which answers with the last N messages and the
thread's `total`), so its poll does not grow with the thread. A send, a reload or a
switch to another conversation SHALL start at the tail again. New messages and the live
turn SHALL still appear at the bottom in real time, and the view SHALL follow them only
while the reader is at the bottom.

#### Scenario: A very long thread opens fast

- **WHEN** the Operator opens an arch conversation with thousands of messages
- **THEN** only the most recent window is rendered, at the newest turn, and the poll payload is the window, not the whole thread

#### Scenario: Show earlier keeps the place

- **WHEN** the Operator scrolls up and clicks "Show earlier messages (N)"
- **THEN** one chunk of older messages is added above, the count drops by that chunk, and the turn they were reading stays in view

#### Scenario: Live append does not disturb a reader

- **WHEN** a wake-up or reply arrives while the Operator is scrolled up in the history
- **THEN** it is appended at the bottom without moving the view; at the bottom, the view follows it

#### Scenario: Whole thread still available

- **WHEN** a client asks `GET /api/arch/messages` without `tail`
- **THEN** the whole thread is returned exactly as before, with `total` equal to its length
