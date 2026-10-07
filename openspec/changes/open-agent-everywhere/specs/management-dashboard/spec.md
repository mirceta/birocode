## ADDED Requirements

### Requirement: Every management surface opens a repo agent the same way and never in silence
Every control that opens a repo agent's harness — the Status tab's chips and button, a Kanban card's assignee chips and its "Open harness" button, a Task-graph node and its assignee chips, the Recurring tab's agent chip, a Repo Agent Requests row — SHALL go through one shared opener that resolves the agent's machine from the fleet status, builds the deep link and opens or focuses the agent's own tab. When the target cannot be opened the opener SHALL announce the reason (fleet status not loaded, machine unknown, machine without an address, repo not listed on that machine, machine unreachable) and the Management App SHALL show it in one notice line visible from every tab, with an "open in a new tab" link wherever a URL exists. The dedicated harness-window mode SHALL fall back to a tab beside the dashboard when its launcher is missing or blocked.

#### Scenario: Card 10922cb3 on the hub
- **WHEN** the Operator clicks the pers-dec chip or "⧉ Open harness" on the card while pers-dec's tab already exists
- **THEN** that tab switches to pers-dec and the Kanban shows a line saying so (or that the tab is in another window, with the link)

#### Scenario: A request from an unreachable machine
- **WHEN** the Operator clicks "⧉ open harness" on a Repo Agent Requests row whose machine did not answer the hub
- **THEN** the line says the machine is unreachable and the tab is opened anyway with the link kept

#### Scenario: The fleet status has not arrived
- **WHEN** a chip is clicked before the board's fleet poll landed
- **THEN** the line says "the fleet status has not arrived — try again in a moment" instead of nothing happening
