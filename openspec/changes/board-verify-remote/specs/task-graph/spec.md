## ADDED Requirements

### Requirement: Cards assigned anywhere in the fleet are verified from their pull request
The verifier SHALL check every card that is not yet `pr-merged` and names a pull
request — by its recorded PR URL, or by its recorded branch in the assignee repo's
GitHub remote (a peer's remote as last described to the hub, a local repo's origin) —
directly against GitHub, regardless of which machine the assignee runs on. An open PR
SHALL land the card at `pr-opened`; a merged PR SHALL land it at `pr-merged` with the
merge commit and PR number recorded, even when the branch no longer exists on origin.
The verifier SHALL never demote a card. A verified merge SHALL clear the card's warning.

#### Scenario: Remote assignee, branch deleted after merge
- **WHEN** a card assigned to an agent on spacex carries a PR URL whose PR is merged and whose branch was deleted on origin
- **THEN** the next pass lands the card at `pr-merged` with the merge commit and PR number, and the "migrated: was done" warning is gone

#### Scenario: GitHub disagrees later
- **WHEN** a card verified `pr-merged` is checked again and GitHub reports the PR open
- **THEN** the card stays `pr-merged`

### Requirement: A merged PR is done where the merge is live
A merged card SHALL land at `done` when the merge commit is contained in the build the
assignee's machine reports as live, or in this hub's live build, judged in a local clone
of the same repository; a repository that is not a deployed harness SHALL count as live
once merged. Without a local clone of the repository the card SHALL stay `pr-merged`.
A card already verified `pr-merged` SHALL be re-checked for liveness without asking
GitHub again.

#### Scenario: The hub deploys the merge
- **WHEN** a card is `pr-merged` and this hub restarts on a build that contains its merge commit
- **THEN** the next pass lands the card at `done`

### Requirement: A verification pass can be run on demand
The harness SHALL run a full verification pass at startup and every minute, and SHALL
offer `POST /api/taskgraph/verify` (and a "Re-verify board" button on the Kanban) that
runs one pass now and reports which cards moved; passes SHALL be serialised.

#### Scenario: Backfill after a deploy
- **WHEN** the operator presses "Re-verify board" after nine finished cards sat at `doing`
- **THEN** the reply lists each card's move and the board shows them at `pr-merged` or `done`
