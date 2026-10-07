# management-app — delta for arch-subagents-tab

## ADDED Requirements

### Requirement: Goal conversations live in one Subagents tab, not in the toolbar
The Management App's toolbar SHALL show exactly two arch tabs — the
Operator-facing "Arch agent" conversation and "Subagents" — however many goal
conversations exist; a non-default arch conversation SHALL never be its own
toolbar tab, and a saved or deep-linked per-conversation tab key from before
this change SHALL land on Subagents with that conversation selected. The
Subagents tab SHALL list every non-default conversation in a vertical,
scrollable selector — each row with the repo agents' own status-dot component
and palette (pulsing turn, amber NEEDS_HUMAN, green armed-between-polls, grey
finished), the exact state named in words, the goal's first line, iterations
against the cap and the last poll — sorted attention first; the selected
conversation SHALL render in the same conversation view the Arch tab uses,
with a running goal's queued-message composer working and a finished one
read-only. Running goals SHALL offer Stop (the stop_arch_goal path) and
finished ones a per-device hide; newly started goals SHALL appear without a
reload, and the Subagents tab label SHALL carry the count of goals running or
waiting on the Operator.

#### Scenario: Five goals, two tabs
- **WHEN** five goal conversations exist in every state (turn running, NEEDS_HUMAN, polling, done, error)
- **THEN** the toolbar shows only "Arch agent" and "Subagents N" (N = running + needs-human), and all five appear as selector rows with the matching dot states, the busy one with Stop, the finished ones with hide

#### Scenario: The old per-goal tab keys migrate
- **WHEN** a browser saved (or a link carries) the pre-change "arch:<conversation id>" tab key
- **THEN** the app opens the Subagents tab with that conversation selected and rendered

#### Scenario: Working with a goal is unchanged
- **WHEN** the Operator selects a running goal conversation and sends a message, or answers a NEEDS_HUMAN
- **THEN** the same queued-message and answer paths run as when the conversation had its own tab, and a finished goal still posts its summary into the Arch agent conversation
