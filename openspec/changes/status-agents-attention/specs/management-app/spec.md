## ADDED Requirements

### Requirement: The Agents subtab offers a split / merged layout
Beside its filters the Status → Agents subtab SHALL offer `split` (two sections per machine,
Occupied above Free, as before) and `merged` (one list per machine, occupied first then free,
each row marked `occupied` or `free`, no section headers). The choice SHALL be remembered per
browser, and every filter and the text filter SHALL work in both modes.

#### Scenario: Merged is compact and still readable
- **WHEN** the Operator picks merged and reloads the page
- **THEN** each machine shows one list with a marker on every row and the page opens in merged mode again

### Requirement: A finished, unchecked agent stays marked until the dedicated dismiss
An agent whose builder turn finished and whose result nobody acknowledged SHALL show the
dashboard's `!` on its chip and in its details, in the running view and wherever it is listed,
in both layouts; the running view SHALL keep it. The state SHALL be the dock tab's server-owned
unseen-result latch, carried on every fleet agent, so a reload and another browser show the same
mark. Expanding the agent SHALL NOT clear it. A dedicated "mark as checked" control SHALL clear
it (`POST /api/arch/fleet/checked`; relayed to a peer behind its accept-sends opt-in), after
which the agent is a normal idle agent and leaves the running view.

#### Scenario: Away from the keyboard
- **WHEN** an agent's turn ends while the Operator is away
- **THEN** on their return the running view still lists it with `!`, and clicking the chip opens its details with the mark intact

#### Scenario: Checked
- **WHEN** the Operator clicks "mark as checked" on that agent
- **THEN** the hub clears the latch (locally or on the peer), the `!` is gone and the agent leaves the running view
