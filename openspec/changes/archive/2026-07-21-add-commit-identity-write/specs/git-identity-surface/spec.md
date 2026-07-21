## ADDED Requirements

### Requirement: Repo commit identity is writable

The system SHALL provide `POST /api/git/identity` that sets the current repo's commit
identity (`user.name` and/or `user.email`) at a caller-chosen scope. `scope` SHALL be
`local` (the repo's own `.git/config`, the default when unspecified) or `global` (the
outer user config). A request supplying at least one of name or email SHALL write those
values via git config and return the re-read `commitIdentity { name?, email?, scope }`.
A request with neither name nor email SHALL be rejected without mutating anything. The
write SHALL be rejected while a chat run is active in the repo, consistent with the
other git mutations, so a commit identity cannot change under an in-flight commit.

#### Scenario: Write a local identity

- **WHEN** a client posts `{ name, email }` (or with `scope: "local"`) for the current repo
- **THEN** the system sets `user.name`/`user.email` in the repo's local `.git/config` and returns `commitIdentity` with those values and `scope: "local"`

#### Scenario: Write a global identity

- **WHEN** a client posts `{ name, email, scope: "global" }`
- **THEN** the system sets the values in the outer/global git config and returns `commitIdentity` with `scope: "global"`

#### Scenario: Partial write

- **WHEN** a client posts only a `name` (or only an `email`)
- **THEN** the system sets just that value and leaves the other as previously configured

#### Scenario: Empty write rejected

- **WHEN** a client posts neither a name nor an email
- **THEN** the system rejects the request and does not change any git config

#### Scenario: Rejected while a run is active

- **WHEN** a chat run is active in the repo and a client posts to `/api/git/identity`
- **THEN** the system rejects the write with a conflict status and does not change any git config

## MODIFIED Requirements

### Requirement: Dock git section shows commit and push identity

Each agent dock's git section SHALL display two identity rows: a **commits as** row
showing the effective commit `name` and `email` with a badge reflecting the `scope`
(`global` or `local`), and a **pushes as** row showing the GitHub account that pushes
authenticate as, sourced from the existing global GitHub account probe
(`GET /api/github-account`). When the commit identity is `unset`, the **commits as**
row SHALL show an explicit "not set" state. When GitHub is not authenticated, the
**pushes as** row SHALL show a "not authenticated" state. The **commits as** row SHALL
offer an edit affordance that lets the user set the repo's commit `name`/`email`
through `POST /api/git/identity` and then refreshes the dock's git status to show the
new value; the **pushes as** row SHALL remain read-only (its credential is set via the
separate PAT control).

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

#### Scenario: Commit identity edited from the dock

- **WHEN** the user opens the **commits as** editor, enters a name and email, and saves
- **THEN** the dock writes the identity via `POST /api/git/identity` and, on success,
  the **commits as** row reflects the new name/email and scope after the status refresh

### Requirement: Identity rows are Advanced-mode

The dock identity rows SHALL be registered in the UI-mode capability map as an
**Advanced**-mode feature, hidden in Basic mode unless the End User is explicitly
determined to need them. The **commits as** editing affordance SHALL ride the same
Advanced-mode feature (no separate flag); the **pushes as** row remains read-only.

#### Scenario: Hidden in Basic mode

- **WHEN** the device UI mode is Basic
- **THEN** the dock identity rows are not shown

#### Scenario: Shown in Advanced mode

- **WHEN** the device UI mode is Advanced
- **THEN** the dock identity rows are shown in each agent dock's git section, with the
  **commits as** row editable
