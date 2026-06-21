## ADDED Requirements

### Requirement: Per-repo planning-system toggle

The custom-prompts pop-up SHALL present a top-level toggle with two options —
**OpenSpec** and **Old system** — and SHALL remember the selected option per
repository.

#### Scenario: Choice persists per repository

- **WHEN** the operator selects "Old system" for repository A and later reopens the pop-up while repository A is open
- **THEN** the pop-up shows "Old system" selected, and other repositories keep their own independent selection

#### Scenario: Default when unset

- **WHEN** a repository has no stored planning-system choice
- **THEN** the pop-up defaults to **OpenSpec**

### Requirement: System-specific built-in prompts follow the toggle

The system SHALL provide the two built-in composer prompts — "Kick off a new
feature" and "write your understanding first" — in both OpenSpec and legacy wording,
and SHALL insert the variant matching the repository's selected planning system.

#### Scenario: OpenSpec selected

- **WHEN** the repository's planning system is OpenSpec and the operator uses the kickoff or write-understanding built-in prompt
- **THEN** the inserted text targets the OpenSpec flow (start an OpenSpec change, write to `proposal.md`)

#### Scenario: Old system selected

- **WHEN** the repository's planning system is Old system and the operator uses the kickoff or write-understanding built-in prompt
- **THEN** the inserted text targets the legacy flow (add a `plan.md` entry, write `understanding.md`)

### Requirement: User prompts and plans are unaffected by the toggle

The toggle SHALL change only the built-in system-specific prompts; the operator's
saved prompts and prompt plans SHALL remain visible and usable under both options.

#### Scenario: Saved prompts visible under both

- **WHEN** the operator switches between OpenSpec and Old system
- **THEN** their saved prompts and prompt plans remain listed and usable, unchanged
