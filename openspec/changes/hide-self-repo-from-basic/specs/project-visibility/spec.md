# project-visibility

## ADDED Requirements

### Requirement: The Self-Development repo is hidden from Basic-mode users

The system SHALL NOT offer the harness's own Self-Development repository (the repo
flagged `isSelf`) to a Basic-mode (End User) client. In Basic mode the project
selector SHALL exclude every `isSelf` repository regardless of that repository's
`visibility` value. The Self-Development repo SHALL remain available to Advanced-mode
users, and SHALL remain pinned and non-removable as today. UI mode is device-local;
this rule is enforced on the client, consistent with existing project-visibility
filtering.

#### Scenario: Basic user does not see the self repo in the project list

- **WHEN** a Basic-mode user opens the project selector
- **THEN** no `isSelf` repository appears in the list, even if its `visibility` is `'basic'`

#### Scenario: Advanced user still sees the self repo

- **WHEN** an Advanced-mode user opens the project selector
- **THEN** the Self-Development (`isSelf`) repository appears and remains selectable, pinned, and non-removable

### Requirement: A Basic-mode user's active repo is never the Self-Development repo

The system SHALL ensure that the resolved current/active repository for a Basic-mode
user is never the `isSelf` repository, even though that repo is the index-0 default and
may be the persisted selection. When the resolved current repo would be the self repo
in Basic mode, the system SHALL fall back to the first Basic-visible repository, or to
the empty/no-project state if none exists.

#### Scenario: Fresh Basic user does not default into Self-Development

- **WHEN** a Basic-mode user loads the app with no valid prior selection (so the index-0 default would be the self repo)
- **THEN** the active repo resolves to the first Basic-visible repo, or the empty state, never the self repo

#### Scenario: Persisted self selection is overridden in Basic mode

- **WHEN** a user's persisted current-repo selection is the self repo and the user is in Basic mode
- **THEN** the active repo re-resolves to a non-self Basic-visible repo (or the empty state)

### Requirement: The Self-Development conversation never renders for a Basic-mode user

The system SHALL NOT render the Self-Development repo's conversation — including the
dual "Claude Web" harness chat view and any self-repo chat sessions — for a Basic-mode
user. This SHALL hold immediately after switching projects, so that opening any other
project never shows the ClaudeWeb self conversation. Toggling from Advanced to Basic
while viewing the self repo SHALL re-resolve the selection and conversation to a
non-self repo (or the empty state) rather than continue showing the self conversation.

#### Scenario: Switching projects does not leak the self conversation

- **WHEN** a Basic-mode user opens a non-self project
- **THEN** that project's conversation is shown and the ClaudeWeb self conversation is not rendered

#### Scenario: Toggling to Basic while on the self repo

- **WHEN** an Advanced-mode user viewing the Self-Development repo toggles to Basic mode
- **THEN** the selection and conversation re-resolve to a non-self repo (or the empty state), and the self conversation stops rendering
