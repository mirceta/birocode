# Git identity surface

## ADDED Requirements

### Requirement: Git status reports the effective commit identity

The system SHALL extend the read-only `GET /api/git/status` response for a repo with
a typed `commitIdentity { name?, email?, scope }` object describing the identity that
repo's commits would be authored as. `scope` SHALL be `local` when the value comes
from the repo's own `.git/config`, `global` when it comes from an outer config
(user/system, e.g. `~/.gitconfig`), and `unset` when no value resolves, in which case
`name` and `email` SHALL be null. The identity SHALL be read via git config with
origin information (so the scope is derived from where the value is defined, not
guessed). Reading the identity SHALL NOT mutate any git config, and a failure to read
it SHALL degrade to `scope: "unset"` without failing the rest of the status response.

#### Scenario: Inherited global identity

- **WHEN** a repo has no local `user.email` and the global config defines one, and a
  client requests `GET /api/git/status`
- **THEN** the response includes `commitIdentity` with `name`/`email` from the global
  config and `scope: "global"`

#### Scenario: Repo-local override

- **WHEN** a repo's own `.git/config` defines `user.email`
- **THEN** the response includes that `name`/`email` with `scope: "local"`

#### Scenario: No identity configured

- **WHEN** neither local nor outer config defines a commit identity
- **THEN** the response includes `commitIdentity` with `scope: "unset"` and null
  `name`/`email`, and the rest of the status payload is unaffected

#### Scenario: Identity read failure does not break status

- **WHEN** the commit-identity read errors for any reason
- **THEN** the status response still returns its other fields and reports
  `commitIdentity` with `scope: "unset"` rather than failing

### Requirement: Dock git section shows commit and push identity

Each agent dock's git section SHALL display two read-only identity rows: a **commits
as** row showing the effective commit `name` and `email` with a badge reflecting the
`scope` (`global` or `local`), and a **pushes as** row showing the GitHub account that
pushes authenticate as, sourced from the existing global GitHub account probe
(`GET /api/github-account`). When the commit identity is `unset`, the **commits as**
row SHALL show an explicit "not set" state. When GitHub is not authenticated, the
**pushes as** row SHALL show a "not authenticated" state. Neither row SHALL mutate any
identity or credential.

#### Scenario: Both identities shown

- **WHEN** a dock's repo has a commit identity and the box has an authenticated GitHub
  account
- **THEN** the git section shows "commits as <name> <email>" with a global/local badge
  and "pushes as <login>"

#### Scenario: Local override is badged distinctly

- **WHEN** the repo's commit identity has `scope: "local"`
- **THEN** the "commits as" row is badged `local` (distinct from the `global` badge)
  so a per-repo override is visible

#### Scenario: Missing states are explicit

- **WHEN** the commit identity is `unset` and/or GitHub is not authenticated
- **THEN** the corresponding row shows "not set" and/or "not authenticated" rather than
  a blank or a misleading value

### Requirement: Identity rows are Advanced-mode

The dock identity rows SHALL be registered in the UI-mode capability map as an
**Advanced**-mode feature, hidden in Basic mode unless the End User is explicitly
determined to need them. The rows SHALL remain read-only in both modes.

#### Scenario: Hidden in Basic mode

- **WHEN** the device UI mode is Basic
- **THEN** the dock identity rows are not shown

#### Scenario: Shown in Advanced mode

- **WHEN** the device UI mode is Advanced
- **THEN** the dock identity rows are shown in each agent dock's git section
