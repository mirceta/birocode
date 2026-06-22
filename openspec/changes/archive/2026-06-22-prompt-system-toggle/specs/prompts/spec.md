## ADDED Requirements

### Requirement: Fixed, hard-coded built-in prompt set

The one-off composer prompts SHALL be a fixed, version-controlled built-in set with
no add / edit / delete; the editable, JSON-backed custom-prompt list is retired. The
separate prompt **Plans** and **Notes** tabs are unaffected.

#### Scenario: No editor

- **WHEN** the operator opens the prompts pop-up
- **THEN** the one-off prompts are shown insert-only (a Use action), with no form to add, edit, or delete them

### Requirement: Per-repo planning-system toggle

The custom-prompts pop-up SHALL present a top-level toggle with two options —
**OpenSpec** and **Old system** — and SHALL remember the selected option per
repository, defaulting to **OpenSpec** when unset.

#### Scenario: Choice persists per repository

- **WHEN** the operator selects "Old system" while repository A is open and later reopens the pop-up for repository A
- **THEN** the pop-up shows "Old system" selected, and other repositories keep their own independent selection

#### Scenario: Default when unset

- **WHEN** a repository has no stored planning-system choice
- **THEN** the pop-up defaults to **OpenSpec**

### Requirement: System-specific built-ins follow the toggle

The system SHALL offer the system-specific built-in prompts (kick off a feature, write
understanding first, close a finished feature, evaluate the options) in both OpenSpec
and legacy wording, and SHALL insert the variant matching the repository's selected
planning system. System-agnostic built-ins SHALL read identically under both options.

#### Scenario: OpenSpec selected

- **WHEN** the planning system is OpenSpec and the operator uses a system-specific built-in
- **THEN** the inserted text targets the OpenSpec flow (e.g. start/validate/archive an OpenSpec change, write to `proposal.md` / `design.md`)

#### Scenario: Old system selected

- **WHEN** the planning system is Old system and the operator uses a system-specific built-in
- **THEN** the inserted text targets the legacy flow (e.g. a `plan.md` entry, `understanding.md`, the old close-out ritual)

#### Scenario: System-agnostic built-ins unchanged

- **WHEN** the operator switches between OpenSpec and Old system
- **THEN** the system-agnostic built-ins (doc-simplify, wall-of-text, understanding-app) read identically under both
