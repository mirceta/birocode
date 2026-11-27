## ADDED Requirements

### Requirement: Agents from any machine can be pinned to a bar at the top of the Status tab
Every agent chip in the Status tab, on every machine of the fleet, SHALL offer pin and unpin. Pinned agents SHALL appear in a bar at the top of the tab, in the order they were pinned, as the same chip the list uses: the same live state, and the same click (details) and double-click (open the agent) behaviour. They SHALL be labelled with machine and agent. The bar SHALL offer unpin and SHALL be hidden when nothing is pinned. Pinning an already pinned agent SHALL change nothing.

#### Scenario: Pinning agents on two machines
- **WHEN** the Operator pins an agent on this hub and one on spacex from their list chips
- **THEN** both appear in the pinned bar, labelled "DESKTOP-POAPPP3 / …" and "spacex / …", and open like the list chips

### Requirement: Pins live on the hub and are never silently dropped
Pins SHALL be stored on the hub, keyed by the machine's sourceId and the repoId, so they survive reloads, other browsers and agent renames. A pin whose machine is not answering, or whose agent is not listed, SHALL stay in the bar, greyed, with the reason. Before the fleet has been read, pins SHALL say the fleet is loading.

#### Scenario: A dark machine
- **WHEN** a pinned agent's machine stops answering
- **THEN** its pin stays in the bar, greyed, saying the machine is not answering
