## ADDED Requirements

### Requirement: Configurable inspected repository

The Control Room app SHALL determine which repository it inspects from the
`OPENSPEC_REPO_ROOT` environment variable when set, and SHALL otherwise default to the
directory that contains the app. A single running instance SHALL therefore be able to
inspect any repository on the host by setting that variable at launch, without copying the
app into the target repository. The app SHALL remain a standalone local app (no dependency
on the harness) regardless of which repository it targets.

#### Scenario: Inspect any repository via the environment variable

- **WHEN** the app is launched with `OPENSPEC_REPO_ROOT` set to a repository path
- **THEN** it runs its OpenSpec reads against that repository's `openspec/` directory, not the directory the app sits in

#### Scenario: Default to the containing repository

- **WHEN** the app is launched with `OPENSPEC_REPO_ROOT` unset
- **THEN** it inspects the repository that contains the app, exactly as before (backward compatible)

#### Scenario: Resolved target is visible

- **WHEN** the app starts
- **THEN** its startup log reports the repository it will inspect and whether that came from `OPENSPEC_REPO_ROOT`
