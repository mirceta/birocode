# local-app-tab Specification

## Purpose
TBD - created by archiving change enable-local-tab-in-basic. Update Purpose after archive.
## Requirements
### Requirement: The Local app tab is available to Basic-mode users

The system SHALL show the Local app tab to Basic-mode (End User) clients, not only to
Advanced-mode clients. The tab SHALL appear in the Basic-mode navigation and, when a
project is selected, embed that project's local app(s) through the harness's
same-origin `/api/localview/<repoId>/app/<appId>/` proxy. UI mode is device-local;
this rule is enforced on the client, consistent with existing per-mode gating.

#### Scenario: Basic user sees the Local tab

- **WHEN** a Basic-mode user views the harness navigation
- **THEN** the Local app tab is present and selectable

#### Scenario: Basic user views a project's running product

- **WHEN** a Basic-mode user with a non-self project selected opens the Local tab and that project has a running local app
- **THEN** the app is embedded via the `/api/localview/<repoId>/app/<appId>/` proxy and is viewable

### Requirement: The Basic-mode Local tab is view-only

For a Basic-mode user the Local app tab SHALL expose only viewing controls — the app
switcher, the embedded product frame, a refresh action, and an open-in-new-tab link —
and SHALL NOT expose any authoring or operator control. Specifically, in Basic mode the
add-app form and its "add app" trigger, the per-app remove control, the exposure-verify
diagnostic and its panel, and the "how to make an app embeddable" setup section SHALL
NOT be shown. The behavior that auto-opens the add-app form when a project has no real
app SHALL NOT trigger in Basic mode.

#### Scenario: Basic user is not shown authoring controls

- **WHEN** a Basic-mode user opens the Local tab for a project
- **THEN** no add-app form, "add app" button, remove control, exposure-verify control, or "how to embed" setup section is shown

#### Scenario: Basic user with no app does not get the authoring form

- **WHEN** a Basic-mode user opens the Local tab for a project that has no real (repo) local app
- **THEN** the add-app form does not auto-open; a friendly empty state is shown and the always-on harness-provided Understanding app remains viewable as the fallback

### Requirement: Advanced-mode Local tab authoring is unchanged

The system SHALL keep every Local tab control available to Advanced-mode users exactly
as before this change: the add-app form (including its auto-open when a project has no
real app), the "add app" trigger, the per-app remove control, the exposure-verify
diagnostic, and the "how to make an app embeddable" setup section.

#### Scenario: Advanced user retains all Local tab controls

- **WHEN** an Advanced-mode user opens the Local tab
- **THEN** the add/remove/exposure-verify controls and the setup section are all available, and the add-app form auto-opens when the project has no real app

### Requirement: The Local tab follows the selected project and respects self-repo hiding

The Local app tab SHALL show the local app(s) of the currently selected project only.
Because Basic-mode users cannot select the Self-Development (`isSelf`) repository, the
self repo's local apps SHALL remain inaccessible from Basic mode without any additional
gating; opening any non-self project SHALL show that project's local app(s).

#### Scenario: Basic Local tab never targets the self repo

- **WHEN** a Basic-mode user uses the Local tab
- **THEN** it targets the selected non-self project, and the Self-Development repo's local apps are never shown

