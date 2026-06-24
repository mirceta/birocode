# openspec-cockpit Specification

## Purpose
TBD - created by archiving change add-openspec-cockpit. Update Purpose after archive.
## Requirements
### Requirement: A read-only Cockpit tab in the Control Room

The Control Room app (`openspec-port-app/`) SHALL present a **Cockpit** tab that displays
live OpenSpec state read-only, as the inspect-twin of the Console tab. The tab SHALL NOT
expose any action that creates, archives, validates, or otherwise mutates OpenSpec
artifacts — every such action stays in the Console tab. Adding the Cockpit SHALL NOT
remove or alter any existing Control Room tab.

#### Scenario: Open the Cockpit

- **WHEN** the operator selects the Cockpit tab
- **THEN** the current OpenSpec state is shown without running any mutating command, and the existing tabs (Console, Control, Workflows, …) remain available

### Requirement: Show in-flight changes with completion status

The Cockpit SHALL list every active change (the contents of `openspec/changes/` excluding
`archive/`), sourced from `openspec list --json`, each showing its name, `status`, last
modified time, and task completion as `completedTasks` of `totalTasks`. Selecting a change
SHALL show its deltas from `openspec show <id> --json` and its task checklist read from the
change's `tasks.md` (which `openspec show --json` does not include), grouped by section with
each item's done state.

#### Scenario: Inspect an active change

- **WHEN** there is an active change with some tasks complete and the operator selects it
- **THEN** the Cockpit shows its completion (e.g. 15 of 19) and status, and on selection reveals its deltas and per-task checklist

#### Scenario: No active changes

- **WHEN** there are no active changes
- **THEN** the in-flight section shows an explicit empty state rather than an error or a blank panel

### Requirement: Show shipped (archived) changes

The Cockpit SHALL list shipped changes read from `openspec/changes/archive/`, newest
first, each showing the ship date taken from the archived folder's date prefix and the
title taken from that change's `proposal.md` heading. Because no OpenSpec CLI command
enumerates archived changes, the server SHALL read the `archive/` directory directly.

#### Scenario: Review what shipped

- **WHEN** one or more changes have been archived
- **THEN** the Cockpit lists them newest-first with each one's ship date and proposal title

### Requirement: Show the living baseline of capabilities

The Cockpit SHALL list the baseline specifications from `openspec spec list --json`, each
showing the capability id and its requirement count, and SHALL let the operator open a
capability to read its requirements and scenarios via `openspec show <cap> --json`. This
is the Cockpit's answer to "what does the system do today?".

#### Scenario: Read a capability's baseline

- **WHEN** the operator opens a capability from the baseline list
- **THEN** the Cockpit shows that capability's requirements and their scenarios

### Requirement: Cross-link in-flight changes to the baseline they touch

The Cockpit SHALL surface the delta relationship between active changes and the baseline:
each in-flight change SHALL show the capabilities its delta specs touch (each badged by its
ADDED / MODIFIED / REMOVED operation), and each baseline capability SHALL indicate how many
active changes are currently editing it. The data SHALL come from the existing
`GET ./api/cockpit` aggregation — each active change carries the capabilities it touches — so
no new endpoint or mutating verb is introduced. A capability with no active change against it
SHALL show no indicator, and a net-new (ADDED) capability not yet in the baseline SHALL appear
only on its change's forward tags.

#### Scenario: See which baseline capability a change edits

- **WHEN** the operator views an in-flight change whose delta specs touch a capability
- **THEN** the change's card shows that capability tagged with its delta operation

#### Scenario: See a baseline capability has work in flight

- **WHEN** an active change has a delta against a capability that exists in the baseline
- **THEN** that capability's baseline card shows that one or more changes are in flight against it, naming them on hover

### Requirement: Teach the old-system → OpenSpec mapping in-app

The Cockpit SHALL render a legend mapping each old `plans/*` operator move — viewing the
current/active plans, inspecting an old or closed plan, asking "what does the system do
today?", and checking a feature's completion — to the OpenSpec primitive that now serves
it, so the operator learns the translation while inspecting.

#### Scenario: Learn the translation

- **WHEN** the operator views the Cockpit's legend
- **THEN** each old planning move is paired with the OpenSpec primitive (active changes, the archive, the spec baseline, task counts) that replaces it

### Requirement: Single read-only aggregation endpoint

The Control Room server SHALL expose a read-only `GET ./api/cockpit` endpoint that returns
active changes, baseline specs, and archived changes in one response, plus a read-only
`GET ./api/cockpit/show?id=<name>` passthrough to `openspec show <name> --json` for
drill-in. These endpoints SHALL only read state; no new mutating verb SHALL be added to the
exec whitelist, and any drill-in id SHALL be sanitised by the existing safe-name rule
before reaching a command.

#### Scenario: Fetch aggregated state

- **WHEN** the Cockpit requests `GET ./api/cockpit`
- **THEN** it receives active changes, baseline specs, and archived changes together, and no OpenSpec artifact is created or modified by the request

#### Scenario: Reject an unsafe drill-in id

- **WHEN** `GET ./api/cockpit/show` is requested with an id that is not a valid lowercase-dash name
- **THEN** the request is rejected without invoking any command

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

#### Scenario: Readiness shown at the top in every state

- **WHEN** the operator opens the Cockpit for any selected repository
- **THEN** a readiness section at the top reports, affirmatively, whether the repository is set up for OpenSpec — both the openspec-on-PATH check and the `openspec/`-present check — confirming when ready, not only warning when not

#### Scenario: Repository not OpenSpec-ready

- **WHEN** the selected repository has no `openspec/` directory or `openspec` is not on PATH
- **THEN** the readiness section shows an explicit not-ready state (which check failed, with the remediation: install the CLI, or run `openspec init`) rather than CLI stderr noise

#### Scenario: Drill-in id is safe-name gated

- **WHEN** a change or archived-change id is requested for drill-in
- **THEN** the id is validated against a safe-name pattern (lowercase letters, digits, dashes) before reaching any command, and an invalid id is rejected

#### Scenario: No mutating verb in the Harness

- **WHEN** any harness Cockpit endpoint is called
- **THEN** it only reads OpenSpec state; the Harness exposes no endpoint that creates, archives, validates, or otherwise mutates OpenSpec artifacts

