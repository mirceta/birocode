## ADDED Requirements

### Requirement: The board carries a goal the Operator sets
The task board SHALL carry a goal text the Operator sets and edits from a panel above the
Kanban (`PATCH /api/taskgraph/goal`). The goal SHALL be part of the fleet-synced board:
the newest write wins across peers, an exact tie converges on one text on every peer, and
a peer whose build predates the goal SHALL NOT erase it. `GET /api/taskgraph` SHALL return
the goal and when it was set.

#### Scenario: Setting the goal
- **WHEN** the Operator saves "Ship the CSV export by Friday" in the goal panel
- **THEN** the panel shows it, every browser of this board shows it on its next poll, and a peer harness shows it after the next sync

#### Scenario: An older peer syncs
- **WHEN** a peer without the goal field merges its board into this one
- **THEN** this board's goal is unchanged

### Requirement: A policeman keeps the board honest against the verified facts
After every verification pass the harness SHALL judge each card from the facts that pass
recorded, without prompting, dispatching or moving anything: a card whose status is ahead
of its verified state SHALL be reported **dishonest** with the same reason as its warning
badge; a card SHALL be reported **stuck** when an assignee that was pinged has no pull
request and either reported `TASK BLOCKED` or has shown no progress for the board's stale
window; a manual card SHALL be reported **manual**; all others **honest**. The verdict
(counts and the flagged cards) SHALL ride `GET /api/taskgraph` as `integrity` and be
shown beside the goal, and be available at `GET /api/taskgraph/integrity`.

#### Scenario: A column ahead of reality
- **WHEN** a card sits in `pr-opened` while the harness has verified nothing beyond `doing`
- **THEN** the next pass reports it dishonest ("column ahead of reality — claimed pr-opened, verified: nothing …"), the card shows a 👮 chip and an amber edge, and the policeman line counts 1 dishonest

#### Scenario: An assignee went quiet
- **WHEN** an assignee was pinged 30 hours ago, is still in `doing`, has no PR and the stale window is 24 hours
- **THEN** the next pass reports the card stuck and stamps it "human assistance requested" by the policeman

#### Scenario: A pull request exists
- **WHEN** an assignee has an open PR and has been silent for days
- **THEN** the card is not stuck (it may be stale); no stamp is made

### Requirement: "Human assistance requested" is one state on the card, raised by several, resolved by the Operator
A card SHALL carry at most one "human assistance requested" state: when it was raised,
by whom (`policeman`, `agent`, `operator`), why, and optionally the id of a human-request
card. The policeman SHALL stamp stuck cards that carry no request and SHALL withdraw only
its own stamp when the card is no longer stuck; it SHALL never clear a request raised by
an agent or the Operator. The Operator SHALL be able to raise it on any card
(`POST /api/taskgraph/nodes/{id}/human`) and resolve it whoever raised it
(`DELETE /api/taskgraph/nodes/{id}/human`). The Kanban SHALL show it as a prominent 🆘
badge on the card with a red edge, offer a `needs human` filter flag, and show who raised
it, why and when in the detail with a "Resolved" control.

#### Scenario: The policeman withdraws its own stamp
- **WHEN** a card stamped by the policeman gains a pull request
- **THEN** the next pass clears the stamp and the 🆘 badge disappears

#### Scenario: An agent's request outlives the policeman
- **WHEN** a repo agent raised a request on a card and the card is also stuck
- **THEN** the agent's request (its reason and request id) is kept as is

#### Scenario: The Operator resolves
- **WHEN** the Operator presses "Resolved" on a card stamped by the policeman
- **THEN** the state is cleared and the badge is gone until the policeman concludes the card is stuck again

### Requirement: A card can be made manual so the harness leaves it alone
The Operator SHALL be able to flip any card to **manual** and back (`PATCH
/api/taskgraph/nodes/{id}` with `manual`), persisted with the card. While manual: the
verifier SHALL NOT probe, advance or badge it; the policeman SHALL NOT judge or stamp it
(flipping to manual drops the policeman's own stamp, never another's); the arch SHALL NOT
dispatch, update or list it as awaiting dispatch; the board's own Ping SHALL be disabled.
The Kanban SHALL show it as a dashed card with a ✋ chip and offer a `manual` filter flag.

#### Scenario: Going manual
- **WHEN** the Operator presses ✋ on a card the arch would dispatch next
- **THEN** the card is dashed and chipped ✋, `list_tasks` shows `manual: true` and not `awaitingDispatch`, the arch's `dispatch_task` answers status `manual`, and the verifier's next pass notes it as not verified

#### Scenario: Back to auto
- **WHEN** the Operator presses "Back to auto" on a manual card whose assignee has been silent past the window
- **THEN** the next pass judges it again and stamps it stuck
