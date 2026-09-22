## ADDED Requirements

### Requirement: An agent's Status details open its harness the way the Kanban badge does
In the Status tab, an agent's expanded details SHALL offer an "open harness" action beside
the free/occupied controls that performs the very same operation a Kanban card badge click
performs for that agent — the same helper with the same tab key (the agent's source and repo)
and the same machine studio link — so it honours the Settings-chosen harness window, keeps
one tab per repo agent, and focuses an existing tab without reloading it. When the fleet does
not know the machine's address the action SHALL be present but disabled and say why.

#### Scenario: Open a peer agent twice
- **WHEN** the Operator expands MONSTER's web-flow agent in Status and clicks "open harness" twice
- **THEN** the first click opens the tab named for that agent at MONSTER's studio link and the second click focuses that tab without navigating it, exactly as the Kanban badge would

#### Scenario: A machine with no known address
- **WHEN** the Operator expands an agent on a machine the fleet registry has no address for
- **THEN** "open harness" is shown disabled with "machine address unknown"
