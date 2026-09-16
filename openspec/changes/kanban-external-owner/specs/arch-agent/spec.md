## ADDED Requirements

### Requirement: The arch and the policeman leave an externally owned card entirely alone
`list_tasks` SHALL carry, per task, `externalOwner` and `externalOwnerAt`; a card with an
external owner SHALL never be `awaitingDispatch`; `dispatch_task` and `update_task` SHALL
refuse it with status `external` and change nothing. The policeman's `board_integrity` SHALL
report the `external` count; `flag_needs_human`, `observe_card` and `sync_card` SHALL refuse
an externally owned card with status `external`; the policeman's prompt SHALL exclude such
cards from the agents it reads and tell it never to read, observe, move, flag or report them
as stuck or dishonest; its verdict line and handover SHALL count them. The arch's role prompt
SHALL distinguish an external owner (another human's card, out of our domain, no authority)
from manual (the Operator's own card, still ours), and the refusals SHALL come from the same
rule as the manual refusals.

#### Scenario: The arch wakes with an externally owned card that would otherwise be dispatched
- **WHEN** a card assigned through the board and not yet pinged is handed to an external owner
- **THEN** `list_tasks` shows `externalOwner` with `awaitingDispatch: false`, and `dispatch_task` on it answers status `external` naming the owner without sending anything

#### Scenario: The policeman's pass
- **WHEN** the policeman runs while an externally owned card sits silent in Doing with no PR
- **THEN** `board_integrity` counts it as external and does not flag it, `observe_card` and `flag_needs_human` on it answer status `external`, and the verdict line reads "… · N manual · 1 external"
