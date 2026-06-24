# openspec-cockpit

## ADDED Requirements

### Requirement: A harness-native read-only Cockpit tab scoped to the selected repo

The Harness SHALL present a read-only **Cockpit** tab that displays live OpenSpec state for
the **currently selected repository**, resolved by the same per-repo mechanism as every
other per-repo endpoint (`X-Repo-Id` header / `?repo=` fallback), so the Cockpit re-scopes
when the Operator switches repositories with no per-repo copy of the Cockpit. The tab SHALL
NOT expose any action that creates, archives, validates, or otherwise mutates OpenSpec
artifacts — it is read-only. Adding this harness Cockpit SHALL NOT remove or alter the
standalone Control Room (`openspec-port-app/`) cockpit; both surfaces coexist. The tab is an
Advanced-mode feature (`cockpitTab`).

#### Scenario: Open the harness Cockpit for the selected repo

- **WHEN** the Operator selects the Cockpit tab with a repository selected
- **THEN** the Harness shows that repository's OpenSpec state (in-flight changes, shipped changes, and living baseline) read-only, without running any mutating command

#### Scenario: Re-scope on repository switch

- **WHEN** the Operator switches to a different repository
- **THEN** the Cockpit re-fetches and shows the newly selected repository's OpenSpec state, with no per-repo copy of the Cockpit code

#### Scenario: Repository not OpenSpec-ready

- **WHEN** the selected repository has no `openspec/` directory or `openspec` is not on PATH
- **THEN** the Cockpit shows an explicit not-ready state (reporting openspec-on-PATH and `openspec/`-present) rather than CLI stderr noise

#### Scenario: Drill-in id is safe-name gated

- **WHEN** a change or archived-change id is requested for drill-in
- **THEN** the id is validated against a safe-name pattern (lowercase letters, digits, dashes) before reaching any command, and an invalid id is rejected

#### Scenario: No mutating verb in the Harness

- **WHEN** any harness Cockpit endpoint is called
- **THEN** it only reads OpenSpec state; the Harness exposes no endpoint that creates, archives, validates, or otherwise mutates OpenSpec artifacts
