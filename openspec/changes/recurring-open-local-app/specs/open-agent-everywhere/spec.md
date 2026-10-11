## ADDED Requirements

### Requirement: Opening an agent can name one of its local apps
The shared open-harness helper SHALL accept an optional app; the agent SHALL open with that app selected in its dock, both in a new tab and in an agent tab that is already open (switched without a reload, on this machine or another); when the app is not one of the agent's apps the agent SHALL open without it and the shared toast SHALL say `app <id> not found on <agent>`.

#### Scenario: The agent's tab is already open on another app
- **WHEN** msg-platform-agent's tab shows its hook app and the Operator opens it with app admin
- **THEN** the same tab switches to admin without reloading and no second tab opens

#### Scenario: An app that is gone
- **WHEN** the Operator opens an agent with an app it does not have
- **THEN** the agent opens and the toast says the app was not found on that agent
