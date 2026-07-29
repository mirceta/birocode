# agent-dock — delta

Adds the copy-for-debugging action to the dock loop popover.

## ADDED Requirements

### Requirement: Copy loop context for debugging

The dock loop popover SHALL offer a copy-for-debugging action that fetches
the agent's loop debug bundle and places a paste-ready block — a one-line
human header plus the bundle as fenced JSON — on the clipboard, confirming
success inline. The action SHALL be available regardless of loop state
(none, armed, or terminal). Where the asynchronous clipboard API is
unavailable (non-secure context), the control SHALL fall back to a
synchronous copy, and if that also fails it SHALL present the block in an
inline read-only text area for manual copying instead of failing silently.

#### Scenario: Copy on a stopped loop

- **WHEN** the user opens the loop popover of an agent whose loop stopped unexpectedly and taps the copy action
- **THEN** the clipboard holds the header plus the bundle JSON and the control confirms the copy

#### Scenario: Clipboard unavailable

- **WHEN** both clipboard mechanisms fail in the user's browser context
- **THEN** the popover shows the same block in a read-only text area selected for manual copy
