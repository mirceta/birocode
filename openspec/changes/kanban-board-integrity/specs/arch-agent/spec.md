## ADDED Requirements

### Requirement: The arch respects manual cards and reports cards that need a human
`list_tasks` SHALL carry the board goal as `boardGoal` and, per task, `manual` and
`needsHuman` (when, by whom, why, request id). A manual card SHALL never be
`awaitingDispatch`; `dispatch_task` and `update_task` SHALL refuse a manual card with
status `manual` and change nothing. The arch's role prompt SHALL tell it to judge the
board against the goal, to report every `needsHuman` card to the Operator on each wake
(who raised it and why) instead of re-pinging its assignee, and never to dispatch,
update, move or judge a manual card.

#### Scenario: The arch wakes with a manual card awaiting work
- **WHEN** a card assigned through the board is manual and not yet pinged
- **THEN** `list_tasks` shows `manual: true` with `awaitingDispatch: false`, and a `dispatch_task` on it answers `manual` without sending anything

#### Scenario: The arch reports a stuck assignee
- **WHEN** the policeman stamped a card "human assistance requested"
- **THEN** `list_tasks` shows `needsHuman` with `by: "policeman"` and the reason, and the arch names the card to the Operator rather than pinging its assignee again
