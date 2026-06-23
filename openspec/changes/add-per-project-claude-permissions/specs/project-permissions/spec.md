# project-permissions

## ADDED Requirements

### Requirement: Per-project permission preset set from the desktop app

The system SHALL let the Operator assign, per registered project, a permission preset — one of
**Read-only**, **Edit-only**, **Standard**, or **Full access** — from the WinForms desktop
application, and SHALL persist that choice on the project's record (`repositories.json`) durably
across restarts. The
preset SHALL be editable only from the desktop GUI; the web/phone UI MAY display it but SHALL NOT
change it.

#### Scenario: Operator sets a project's preset

- **WHEN** the Operator selects a preset for a project in the desktop app and the choice is saved
- **THEN** that project's record persists the preset and it survives a restart

#### Scenario: Web cannot widen the scope

- **WHEN** a request arrives from the web/phone UI attempting to change a project's preset
- **THEN** the preset is not changed (the web UI is read-only for permissions)

### Requirement: The web dashboard reflects each project's preset read-only

The system SHALL expose each project's permission preset on the web repositories API and SHALL
display it as a read-only badge on that project's agent dock in the web Dashboard, so the End User
can see what the agent for that project is allowed to do. The badge SHALL be display-only: it SHALL
NOT provide any control to change the preset (configuration remains desktop-only). An unconfigured
project SHALL show the Read-only badge (matching the safe default).

#### Scenario: Dock shows the configured preset

- **WHEN** the web Dashboard renders an agent dock for a project the Operator set to Edit-only
- **THEN** that dock shows a read-only "Edit-only" permission badge and offers no way to change it

#### Scenario: Unconfigured project shows Read-only

- **WHEN** the web Dashboard renders an agent dock for a project that has no stored preset
- **THEN** that dock shows the Read-only badge

### Requirement: Unconfigured projects default to the safe Read-only preset

The system SHALL treat a project with no stored permission preset as **Read-only** (the safe
default), rather than as unrestricted. This SHALL apply to every project that has no explicit
preset, including projects already registered before this capability existed.

#### Scenario: A project with no preset

- **WHEN** a chat call is made for a project that has never had a preset set
- **THEN** the call is run under the Read-only preset until the Operator opts the project up

### Requirement: The project's preset scopes its chat `claude -p` calls

The system SHALL apply the project's permission preset to every direct chat `claude -p` call the
harness spawns for that project, by injecting the matching permission flags into the CLI
invocation. Read-only SHALL block all mutations (read/search only); Edit-only SHALL allow editing
within the project but SHALL deny running scripts/executables (the shell tool) and network access;
Standard SHALL allow normal development while denying a curated set of destructive/exfiltration
actions (deny always taking effect); Full access SHALL apply no added restriction.

#### Scenario: Read-only blocks mutation

- **WHEN** a chat turn runs for a project set to Read-only and the agent attempts to edit a file or run a shell command
- **THEN** the mutation does not execute (the agent can still read, search, and answer)

#### Scenario: Edit-only allows edits but blocks execution

- **WHEN** a chat turn runs for a project set to Edit-only and the agent edits a repo file and also attempts to run a shell command or executable
- **THEN** the file edit succeeds while the shell command / executable does not run

#### Scenario: Standard denies destructive actions

- **WHEN** a chat turn runs for a project set to Standard and the agent attempts a denied destructive action
- **THEN** that action is blocked while ordinary in-repo development still proceeds

### Requirement: Most-restrictive wins between the ask lane and the preset

The system SHALL combine the project's preset with the existing read-only "ask" lane such that the
most restrictive of the two applies. A read-only ask-lane conversation SHALL remain read-only even
for a project set to Full access.

#### Scenario: Ask lane on a Full-access project

- **WHEN** a read-only ask-lane conversation runs for a project set to Full access
- **THEN** the conversation is still read-only (mutations are blocked)

### Requirement: Scope is the direct chat path only

The system SHALL apply per-project permissions to the direct chat `claude -p` path only. The
structured-ask gateway path SHALL be out of scope for this capability, as it carries no End-User
free-text into its prompt.

#### Scenario: Structured-ask path unaffected

- **WHEN** a structured-ask (e.g. local-app discovery) runs through the gateway
- **THEN** the per-project permission preset does not alter it
