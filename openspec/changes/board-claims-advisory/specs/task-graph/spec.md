## ADDED Requirements

### Requirement: Claims move the card and verification annotates it

The board SHALL apply a claimed status exactly — through the arch's `update_task`, the
Operator's node PATCH and the Kanban — to any of `todo | doing | committed | pr-opened |
pr-merged | done`, in either direction, with the branch, commit and PR arguments recorded
on the card; nothing SHALL clamp or silently downgrade a claim. The harness SHALL keep
verifying facts and record `verifiedStatus` and `verifiedAt`; when the verified state is
lower than the card's status (above `doing`) the card SHALL carry a warning naming the
claim, the verified state and the reason, exposed by `list_tasks` as `unverified` and
`warning` and on the Kanban as a badge; when verification catches up the warning SHALL
clear, and when the facts exceed the status the harness SHALL advance the card forward,
never back. A card claimed `done` but verified less SHALL keep being verified until its
facts catch up. A pre-lifecycle `done` SHALL keep its status on migration, badged when
no merge evidence is recorded. This supersedes the clamp in "Harness-verified lifecycle
transitions" (openspec kanban-lifecycle-columns).

#### Scenario: The arch moves a card past what was verified

- **WHEN** the arch calls `update_task` with status pr-merged on a card whose recorded branch is not on origin
- **THEN** the card is pr-merged, badged "claimed pr-merged, verified: doing — branch not on origin", and `list_tasks` reports it `unverified`

#### Scenario: Verification catches up

- **WHEN** the verifier later finds that card's PR merged and live
- **THEN** the card is done with no warning

#### Scenario: Backward is free

- **WHEN** the arch moves a badged pr-merged card back to doing
- **THEN** the card is doing with no warning

#### Scenario: Re-verify settles the stuck cards

- **WHEN** the Operator presses "Re-verify board" with nine merged cards sitting at doing
- **THEN** every one of them shows pr-merged or done with no warning
