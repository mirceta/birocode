## ADDED Requirements

### Requirement: The Status tab shows occupancy in two sections and lets the Operator set it

Under each fleet machine, the Status tab's Agents view SHALL split the agents into two
sections, **Occupied** above **Free**, each with its count and with an empty section shown
as such. Free and occupied agents SHALL be visually distinct at a glance, and an agent whose
occupancy the Operator set SHALL carry a mark (✋). An agent's expanded details SHALL offer a
three-way control — occupied, free, automatic — showing which is in effect and whether the
Operator or the branch rule decided it; a change SHALL take effect immediately and survive a
refresh and a harness restart. The state filter chips SHALL be `free` and `occupied`
(occupancy-based); a saved `on main` / `not on main` choice SHALL map onto them.

#### Scenario: Setting an agent occupied

- **WHEN** the Operator expands `prg` (on `main`, listed under Free) and presses **occupied**
- **THEN** `prg` moves to that machine's Occupied section with ✋, the details read "occupied — set by the Operator", and after a refresh it is still there

#### Scenario: Back to automatic

- **WHEN** the Operator presses **automatic** on an agent they had set
- **THEN** the branch rule decides again and the ✋ disappears
