## ADDED Requirements

### Requirement: A card can be owned by an external human developer, and is then out of our domain
The Operator SHALL be able to name a DIFFERENT human developer as a card's **external
owner** (`POST /api/taskgraph/nodes/{id}/owner` with a free-text `name`, blank refused)
and clear it (`DELETE …/owner`), persisted with the card and synced with the board. The
external owner SHALL be a state distinct from **manual** (the Operator's own card handled by
hand): both MAY be set, external SHALL win, and both SHALL share one skip rule. While a card
has an external owner: the verifier SHALL NOT probe, advance or badge it; the policeman
SHALL judge it **external** — never dishonest, never stuck, never stamped "needs human" —
and SHALL count it separately; naming an owner SHALL withdraw the policeman's own "needs
human" stamp and observation and leave an agent's or the Operator's stamp alone; the arch
SHALL NOT dispatch, update, move or list it as awaiting dispatch; the board's own Ping SHALL
be disabled.

#### Scenario: Handing a lying, silent card to another developer
- **WHEN** the Operator names "Jane Doe" as the external owner of a card whose column is ahead of the facts and whose assignee has been silent past the window
- **THEN** the next pass notes it "external — owned by Jane Doe, not verified", the verdict reports it external with no flag and no 🆘, `list_tasks` shows `externalOwner: "Jane Doe"` and not `awaitingDispatch`, and `dispatch_task` / `update_task` answer status `external` without changing anything

#### Scenario: Ours again
- **WHEN** the Operator clears the external owner of that card
- **THEN** the next pass judges it again (dishonest for the column, stuck for the silence) exactly as any card of ours

#### Scenario: Manual and external together
- **WHEN** a manual card is handed to an external owner
- **THEN** it is reported and styled as external (not manual) while the manual flag is kept, and clearing the owner leaves it manual

### Requirement: The Kanban shows at a glance whose card it is
A card with an external owner SHALL carry an **Owner** section reading "👤 <name> (external)"
with that it is out of our domain, who set it and when, and an inline "↩ Ours again"; its
Board check SHALL read "👤 External owner — <name> owns this card — not ours to judge" and
win over manual, needs human and not-verified; the card SHALL be styled distinctly from a
manual card; the detail SHALL offer a name field with "👤 External owner" and, once set,
"↩ Ours again"; an `external owner` filter flag SHALL exist; the policeman line SHALL count
"· N external".

#### Scenario: Reading the board
- **WHEN** a card owned by "Jane Doe (Acme)" sits in PR open with an unpushed branch
- **THEN** the card shows "OWNER 👤 Jane Doe (Acme) (external) — out of our domain … set by you (operator), 3 h ago ↩ Ours again", its Board check says "External owner", the words "Not verified yet" and "Needs human" appear nowhere on it, its Ping is disabled, and the policeman line counts it as external

#### Scenario: Handing over from the detail
- **WHEN** the Operator opens one of our cards, types "Bob" and presses "👤 External owner"
- **THEN** `POST …/owner {name: "Bob"}` is sent, the Owner section appears naming Bob, and pressing "↩ Ours again" sends `DELETE …/owner` without opening the card
