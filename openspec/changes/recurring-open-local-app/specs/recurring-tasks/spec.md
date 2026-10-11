## ADDED Requirements

### Requirement: A tracking card's "open harness" lands on its local app
When a tracking card names an app, its "open harness" SHALL open the card's repo agent on its machine with that local app selected in the agent's dock, exactly as clicking the app's tab would; a card without an app SHALL open the agent as before.

#### Scenario: The reservations card
- **WHEN** the Operator clicks "open harness" on "Reservations for Booking and Airbnb" (msg-platform-agent, app admin)
- **THEN** msg-platform-agent's harness opens with the admin app selected and showing

### Requirement: The card editor picks the app from the agent's registered apps
The tracking card editor SHALL offer the chosen agent's registered local apps as a list — for an agent on this machine or on any fleet machine whose build reports them — and SHALL fall back to a typed id only for a machine that does not report its apps.

#### Scenario: An agent on another machine
- **WHEN** the Operator edits a tracking card whose agent lives on a peer
- **THEN** the app field lists that agent's apps by name

### Requirement: The arch names a card's app by id or name
`create_recurring` and `update_recurring` SHALL accept the app by id or by name from the agent's apps (listed by `list_agents`) and SHALL refuse an app the agent does not have, naming the agent's apps.

#### Scenario: An unknown app
- **WHEN** the arch sets appId "reservations" on msg-platform-agent, whose apps are admin, hook, old-convos and gdpr
- **THEN** nothing changes and the answer lists those four apps
