# agent-dock — delta spec

## ADDED Requirements

### Requirement: Standing Arch Agent entry point

The system SHALL provide a standing Arch Agent entry point that is not one of the
per-repo dock tabs: an Arch view in the chat view switcher (beside the harness
view), always available in Advanced mode even when the dock roster is empty, and
visually distinct from repo tabs so it does not read as another repo. The dock
toolbar SHALL additionally let the operator show an Arch tile on the dashboard
grid; that tile SHALL present chat only — repo-bound chrome (repo path, git status,
local apps) SHALL NOT be rendered on it.

#### Scenario: Arch view reachable with an empty dock

- **WHEN** the operator has no dock tabs and switches the chat view to Arch in Advanced mode
- **THEN** the standing Arch Agent conversation opens, ready to prompt

#### Scenario: Arch tile on the dashboard

- **WHEN** the operator enables the Arch entry from the dock toolbar
- **THEN** an Arch tile appears in the grid with the Arch chat and no repo-bound chrome, and toggling it off removes the tile without deleting the conversation
