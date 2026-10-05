## MODIFIED Requirements

### Requirement: A finished, unchecked agent stays marked until the dedicated dismiss
An agent whose builder turn finished and whose result nobody acknowledged SHALL show the
dashboard's `!` on its chip and in its details, in the running view and wherever it is listed,
in both layouts; the running view SHALL keep it. The state SHALL be the dock tab's server-owned
unseen-result latch where the machine reports it and the repo holds a dock there; where it does
not (a machine on a build that predates the latch, or a repo with no dock) the hub SHALL raise the
mark itself from that machine's `turn.ended` events (builder lane, `done` or `error`), SHALL say
the mark came from the hub, and SHALL mark the machine as not reporting the mark itself. The hub
SHALL NOT turn a machine's silence into "no mark". Expanding the agent SHALL NOT clear it. A
dedicated "mark as checked" control SHALL clear it (`POST /api/arch/fleet/checked`; relayed to a
peer only where its latch speaks), after which the agent is a normal idle agent and leaves the
running view. A hub restart SHALL neither forget a pending mark nor re-raise one already checked.

#### Scenario: Away from the keyboard
- **WHEN** an agent's turn ends while the Operator is away
- **THEN** on their return the running view still lists it with `!`, and clicking the chip opens its details with the mark intact

#### Scenario: A machine on a build before the mark
- **WHEN** a builder turn ends on a peer whose describe carries no `unseenResult`
- **THEN** the hub marks the agent from the peer's `turn.ended` event, its details say the hub raised it, and the machine shows `finish mark: from the hub`

#### Scenario: Checked
- **WHEN** the Operator clicks "mark as checked" on that agent
- **THEN** the hub clears the latch (locally, on the peer where it speaks, or its own record), the `!` is gone and the agent leaves the running view
