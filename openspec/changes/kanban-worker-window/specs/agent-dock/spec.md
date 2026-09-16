# agent-dock — delta for kanban-worker-window

## ADDED Requirements

### Requirement: Deep link to a repo agent's dock
The harness SHALL accept `/studio?agent=<ref>` and, once the dock tab list and
repo list have loaded, resolve `<ref>` as an exact repo id, else this
harness's repo handle, else repo name (case-insensitive); it SHALL activate
the existing dock tab for that repo or open a new one (selecting the repo's
project, as explicit tab selection does), and SHALL then consume the query
parameter from the URL so a refresh or back-navigation does not re-steer the
browser tab. An unresolvable `<ref>` SHALL change nothing beyond consuming
the parameter.

#### Scenario: Link opens the exact agent
- **WHEN** a browser loads `/studio?agent=<repoId>` for a repo with no open dock tab
- **THEN** a dock tab for that repo opens and becomes active, and the address bar no longer carries the agent parameter

#### Scenario: Existing tab is reused
- **WHEN** a dock tab for the referenced repo already exists
- **THEN** that tab becomes active — no duplicate tab is created
