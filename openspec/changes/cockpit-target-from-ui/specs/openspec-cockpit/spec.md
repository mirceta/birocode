## MODIFIED Requirements

### Requirement: Configurable inspected repository

The Control Room app SHALL determine which repository it inspects, and SHALL resolve the
target in this order of precedence: a per-request `root` supplied by the UI, then the
`OPENSPEC_REPO_ROOT` environment variable set at launch, then the directory that contains
the app. A single running instance SHALL therefore be able to inspect any repository on the
host — either by setting the environment variable at launch or by entering a repo-root path
in the Cockpit at runtime — without copying the app into the target repository and without a
restart. The app SHALL remain a standalone local app (no dependency on the harness)
regardless of which repository it targets.

The Cockpit's read endpoints SHALL accept the per-request `root`; an absent `root` SHALL
fall back to the launch default, and a `root` that is not an existing directory SHALL
produce a clean error rather than a read against the wrong location. Per-request targeting
SHALL be scoped to the Cockpit's read-only state; it SHALL NOT add or alter any mutating
verb.

#### Scenario: Inspect any repository from the Cockpit UI

- **WHEN** a repo-root path is entered in the Cockpit's textbox and submitted
- **THEN** the Cockpit re-reads OpenSpec state against that repository for that request, without restarting the app

#### Scenario: Textbox is pre-filled with the resolved default

- **WHEN** the Cockpit first loads
- **THEN** the textbox shows the repository the app currently resolves to (the environment variable, or the containing repo)

#### Scenario: Invalid repo-root path is rejected cleanly

- **WHEN** a `root` that is not an existing directory is submitted
- **THEN** the request returns an error and the Cockpit surfaces it, rather than reading some other repository

#### Scenario: Inspect any repository via the environment variable

- **WHEN** the app is launched with `OPENSPEC_REPO_ROOT` set to a repository path and no per-request `root` is supplied
- **THEN** it runs its OpenSpec reads against that repository's `openspec/` directory, not the directory the app sits in

#### Scenario: Default to the containing repository

- **WHEN** the app is launched with `OPENSPEC_REPO_ROOT` unset and no per-request `root` is supplied
- **THEN** it inspects the repository that contains the app, exactly as before (backward compatible)

#### Scenario: Resolved target is visible

- **WHEN** the app starts
- **THEN** its startup log reports the repository it will inspect and whether that came from `OPENSPEC_REPO_ROOT`
