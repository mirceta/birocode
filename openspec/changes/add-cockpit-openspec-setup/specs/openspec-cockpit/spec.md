## MODIFIED Requirements

### Requirement: A harness-native read-only Cockpit tab scoped to the selected repo

The Harness SHALL present a **Cockpit** tab that displays live OpenSpec state for
the **currently selected repository**, resolved by the same per-repo mechanism as every
other per-repo endpoint (`X-Repo-Id` header / `?repo=` fallback), so the Cockpit re-scopes
when the Operator switches repositories with no per-repo copy of the Cockpit. The tab SHALL
be read-only for all OpenSpec **inspection** — viewing in-flight changes, shipped changes,
the living baseline, and drill-ins SHALL NOT create, archive, validate, or otherwise mutate
OpenSpec artifacts. The **only** state-changing action the tab MAY expose is the explicit,
gated **setup action** defined in "Set up a repository for OpenSpec from the Cockpit"; no
other mutating verb (create change, archive, validate, sync, …) SHALL be exposed. Adding
this harness Cockpit SHALL NOT remove or alter the standalone Control Room
(`openspec-port-app/`) cockpit; both surfaces coexist. The tab is an Advanced-mode feature
(`cockpitTab`).

#### Scenario: Open the harness Cockpit for the selected repo

- **WHEN** the Operator selects the Cockpit tab with a repository selected
- **THEN** the Harness shows that repository's OpenSpec state (in-flight changes, shipped changes, and living baseline) read-only, without running any mutating command

#### Scenario: Re-scope on repository switch

- **WHEN** the Operator switches to a different repository
- **THEN** the Cockpit re-fetches and shows the newly selected repository's OpenSpec state, with no per-repo copy of the Cockpit code

#### Scenario: Readiness shown at the top in every state

- **WHEN** the operator opens the Cockpit for any selected repository
- **THEN** a readiness section at the top reports, affirmatively, whether the repository is set up for OpenSpec — both the openspec-on-PATH check and the `openspec/`-present check — confirming when ready, not only warning when not

#### Scenario: Repository not OpenSpec-ready

- **WHEN** the selected repository has no `openspec/` directory or `openspec` is not on PATH
- **THEN** the readiness section shows an explicit not-ready state (which check failed) with remediation — when the CLI is missing it directs the operator to install it; when the CLI is present but `openspec/` is absent it offers the actionable setup action — rather than CLI stderr noise

#### Scenario: Drill-in id is safe-name gated

- **WHEN** a change or archived-change id is requested for drill-in
- **THEN** the id is validated against a safe-name pattern (lowercase letters, digits, dashes) before reaching any command, and an invalid id is rejected

#### Scenario: No mutating verb beyond the gated setup action

- **WHEN** any harness Cockpit endpoint other than the gated setup endpoint is called
- **THEN** it only reads OpenSpec state; the Harness exposes no endpoint that creates, archives, validates, or otherwise mutates OpenSpec artifacts except the single explicit setup action

## ADDED Requirements

### Requirement: Set up a repository for OpenSpec from the Cockpit

The Harness Cockpit SHALL expose a single explicit **setup action** that ports the
currently selected repository to OpenSpec without the operator leaving the Harness. The
action SHALL be served by one state-changing endpoint (e.g. `POST ./api/openspec/setup`)
that runs only a **fixed OpenSpec verb** — `openspec init --tools claude` to scaffold a
fresh repository, or `openspec update` to refresh instruction files in an
already-initialized repository — in the repository working directory resolved by the same
`X-Repo-Id` / `?repo=` mechanism as the read endpoints. The endpoint SHALL NOT accept
arbitrary command arguments. On init, the endpoint SHALL be **guarded against clobbering**:
if an `openspec/` directory already exists in the target repository, it SHALL NOT run init
and SHALL report that the repository is already initialized. After the verb runs, the
endpoint SHALL re-run the readiness check and return both the command result (success or
the captured error) and the refreshed readiness so the Cockpit can update in place. The
setup action SHALL be offered in the UI only when it is applicable — the init action only
when the CLI is present and `openspec/` is absent, the update action only when the
repository is already initialized.

#### Scenario: Set up a not-ready repository

- **WHEN** the operator triggers the setup action for a selected repository that has the `openspec` CLI on PATH but no `openspec/` directory
- **THEN** the Harness runs `openspec init --tools claude` in that repository's working directory, then re-runs the readiness check, and the Cockpit reflects the now-ready state (openspec/ present) without a manual page reload

#### Scenario: Refuse to clobber an already-initialized repository

- **WHEN** the setup init action is invoked against a repository that already has an `openspec/` directory
- **THEN** the endpoint does not run `openspec init`, leaves the existing OpenSpec tree untouched, and reports that the repository is already initialized

#### Scenario: Setup is unavailable without the CLI

- **WHEN** the selected repository does not have the `openspec` CLI on PATH
- **THEN** the Cockpit does not offer the init setup action (since it cannot run) and the readiness section instead directs the operator to install the CLI

#### Scenario: Refresh instruction files on an initialized repository

- **WHEN** the operator triggers the update action for a repository that is already OpenSpec-initialized
- **THEN** the Harness runs `openspec update` in that repository's working directory and surfaces the result

#### Scenario: Fixed verb and repo scoping enforced

- **WHEN** the setup endpoint is called
- **THEN** it runs only the fixed `openspec init --tools claude` or `openspec update` verb in the resolved repository working directory, rejecting any attempt to pass arbitrary arguments, and never targets a directory other than the selected repository

#### Scenario: Surface a setup failure cleanly

- **WHEN** the fixed setup verb exits non-zero (for example the CLI errors mid-scaffold)
- **THEN** the Cockpit surfaces the captured command result as an explicit failure and the readiness section continues to reflect the repository's true state rather than a false success
