# Git

## ADDED Requirements

### Requirement: Review the current branch against a selectable base

The system SHALL let the Operator review the checked-out branch's changes as a PR-style diff
(commits and per-file patches) computed against a base branch, and SHALL let the Operator
choose that base branch from the set of branches in the repository. When the Operator does not
choose a base, the system SHALL auto-detect a default base (preferring an origin base such as
`origin/main`/`origin/master`, then a local `main`/`master`). The review SHALL always report
which base was actually used, and a chosen base SHALL be validated to exist before use.

#### Scenario: Default base when none chosen

- **WHEN** the Operator opens the branch review without choosing a base
- **THEN** the system computes the diff against the auto-detected default base and reports that base in the result

#### Scenario: Choose a different base

- **WHEN** the Operator selects a different base branch from the available bases
- **THEN** the system recomputes the commits and per-file patches against the selected base and reports the selected base as the one used

#### Scenario: List available bases

- **WHEN** the Operator opens the base picker
- **THEN** the system offers the repository's local and `origin/*` branches as candidate bases and indicates the auto-detected default

#### Scenario: Unknown base rejected

- **WHEN** a base branch is requested that does not resolve to a commit in the repository
- **THEN** the system rejects the request with an error rather than returning a diff against a different base

#### Scenario: Selected base is remembered

- **WHEN** the Operator has chosen a base for a repository and later returns to that repository's review
- **THEN** the previously chosen base is pre-selected if it still exists, otherwise the default base is used
