# Board verifier: remote assignees, and a merged PR as proof

## Why

After the lifecycle board landed (openspec kanban-lifecycle-columns), the migration
moved ten finished cards to `committed` and the arch's relayed claims (pr-merged +
branch + PR URL) were clamped to `doing` with "branch not on origin". Only the one card
whose assignee runs on this hub was then verified and advanced: the verification poller
probes assignee repos ON THIS MACHINE only, so the nine cards assigned to agents on
spacex, the living room, laptop_pisarna and razvoj2016 stayed at `doing` with no
verified status. Their merged branches were also deleted on origin, so a branch-based
check can never succeed for them — the PR's merged state has to be enough.

## What changes

- **PR facts for every card.** A pass now checks any card still short of `pr-merged`
  that names a PR — its recorded PR URL, or its recorded branch in the assignee repo's
  GitHub remote (a peer's remote from the fleet cache, a local one from its clone) —
  directly against GitHub, whichever machine the assignee runs on.
- **Merged PR = proof.** A merged PR lands the card at `pr-merged` with its merge commit
  and PR number even when the branch is gone; it lands at `done` when the merge commit is
  contained in the build the assignee's machine (or this hub) reports as live, or when
  the repo is not a deployed harness at all. Observation stays forward-only.
- **Backfill.** The poller's first pass at startup covers the stuck cards; the operator
  can also run a pass now: `POST /api/taskgraph/verify` and a "Re-verify board" button
  on the Kanban that reports what moved.
- **Warning cleared.** A verified merge clears the card's warning badge ("migrated: was
  done, no merged PR recorded", or a clamped over-claim).
- **Follow-up, not in this change:** relaying commit/push facts that only the assignee's
  machine can see (a branch not yet on origin) from each peer's poller to the hub.

## Expected backfill on the fleet board

bed0f74a (PR #64), ce4eba2c (#66), 3c79fbec (#67), 20ba36e5 (#68), 379f58b3 (#69),
76ee2c86 (#70), f9756383 (#71), f12f11af (#74), 50e8275e (#73) → `pr-merged`, and
`done` where the hub's live build already contains the merge.

## Non-goals

The clamp rule for arch claims is unchanged; no UI redesign beyond the one button.
