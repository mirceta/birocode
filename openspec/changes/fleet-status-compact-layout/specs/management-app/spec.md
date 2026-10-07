## ADDED Requirements

### Requirement: The Fleet Status head is pinned
The Status tab's head (title and view tabs) and its filter bar SHALL stay visible at the top of
the Status pane while the machine list scrolls, on a solid background with a visible bottom edge,
at every pane width the dashboard offers.

#### Scenario: Scrolled to the bottom of a long fleet
- **WHEN** the Operator scrolls the machine list down
- **THEN** the filter bar and the Agents / Overview / By plan / Scoreboard tabs remain at the top of the pane and the list passes under them, legible

### Requirement: Every machine shows the same facts in the same place
Each machine's general information SHALL be rendered as one aligned key/value grid — status,
build, hub sync, sends, upgrades, gate, may-send, agents, managed, running, and hidden-by-filter
when a filter is on — with the same columns in the same order for every machine. A column that
does not apply to a machine SHALL show a placeholder ("—" or "?"), never be dropped. State SHALL
be conveyed by the cell's colour, not by separate pills.

#### Scenario: The hub itself
- **WHEN** the machine is the hub
- **THEN** its hub-sync and may-send cells read "—" and the other columns line up with every peer's

#### Scenario: An unreachable peer
- **WHEN** the hub cannot reach a machine
- **THEN** its status cell says so, the facts it cannot report read "?", and the row keeps every column

### Requirement: Agent chips are orderly and the working ones bigger
A machine's agent chips SHALL sit on a column grid of equal cells. Within every section and in
the merged list, the order SHALL be running first, then finished-not-checked, then idle,
alphabetical by name within each group. A running or finished-not-checked chip SHALL be visibly
larger than an idle chip (wider cell and larger type) while staying on the grid, and no layout
SHALL overflow the pane horizontally.

#### Scenario: Two running, three idle
- **WHEN** a machine has two running and three idle agents
- **THEN** the two running chips come first, each wider than any idle chip, and the idle chips follow in alphabetical order

### Requirement: Compact machine blocks
The Status tab SHALL fit at least four machine blocks, each with agents in both sections, fully on
the first screen of a 1500 × 950 dashboard viewport in the split layout (five or more in merged),
without horizontal overflow, keeping Occupied above Free.

#### Scenario: Nine machines
- **WHEN** the fleet has nine machines
- **THEN** at least four of their blocks are fully visible on the first screen in split, five in merged
