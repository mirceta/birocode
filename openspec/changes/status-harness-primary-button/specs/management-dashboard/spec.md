# management-dashboard — delta for status-harness-primary-button

## ADDED Requirements

### Requirement: Open harness is the primary action of an agent's Status details
In the Status tab's agent details, the open-harness control SHALL be the
visually dominant primary action: a large accent-filled button (hit target at
least 44 px tall) with an icon and a clear label, placed in the same position
for every agent — the first action, directly under the agent's identity line —
legible in both the light and dark schemes. Every other control in the details
SHALL remain visibly secondary to it. The control's behaviour SHALL be exactly
the shared open-harness logic (the Kanban badge's tab key, URL derivation,
one tab per agent, focus without reload), and a machine with an unknown
address SHALL show the same button disabled with the reason.

#### Scenario: The button is the first thing in the details
- **WHEN** the Operator clicks any agent chip on the Agents subtab
- **THEN** the details open with the large "Open harness" button as the first focusable action, in the same place for every agent, and every other control in the details is smaller

#### Scenario: Presentation changed, behaviour did not
- **WHEN** the primary button is clicked twice for a peer agent
- **THEN** the agent's named harness tab is opened once at that machine's studio deep link and the second click focuses it without reloading — identical to the Kanban badge
