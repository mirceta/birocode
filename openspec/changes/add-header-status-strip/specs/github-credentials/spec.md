# github-credentials Delta

## MODIFIED Requirements

### Requirement: Token entry is Advanced-mode and write-only in the UI

The header status strip's GitHub chip SHALL provide an **Advanced**-mode
control to submit a token to `POST /api/github-credentials` (the control moves
with the chip from the dashboard to the strip). The input SHALL be write-only —
it SHALL NOT fetch or display any stored token — and SHALL use a masked field.
On success the UI SHALL allow the existing GitHub account indicator to reflect
the newly authenticated account on its next poll. The control SHALL set only
the **auth/push** identity and SHALL NOT change the commit-author identity
(`user.name` / `user.email`).

#### Scenario: Hidden in Basic mode

- **WHEN** the device UI mode is Basic
- **THEN** the token-entry control is not shown

#### Scenario: Write-only masked entry

- **WHEN** the user opens the token control
- **THEN** it presents a masked, empty input that never displays a previously
  stored token, and submitting it clears the field

#### Scenario: Success reflected by the account indicator

- **WHEN** a valid token is submitted and accepted
- **THEN** the GitHub account indicator reflects the authenticated account on
  its next poll, without the commit-author identity changing
