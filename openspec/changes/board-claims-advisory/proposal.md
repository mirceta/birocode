# Proposal: board-claims-advisory — the arch's update_task moves the card; verification is a badge, never a veto

## Why

The lifecycle board (openspec kanban-lifecycle-columns) clamped the arch's `update_task`
claims to the verified state. The verifier only inspected repos on the hub, so nine
merged cards assigned to remote agents were clamped from pr-merged back to "doing" and
the arch could not correct the board. The Operator (2026-09-06): "if the arch is not
able to move cards in the kanban then the whole thing is done wrong." That behaviour
must go (board task b925565e).

## What

1. **`update_task` moves the card.** The arch's status is applied exactly — todo, doing,
   committed, pr-opened, pr-merged or done, in either direction — and the branch /
   commit / pr args are recorded on the card. No clamping, no silent downgrade. The
   Operator's PATCH and the Kanban drag behave the same (they always did).
2. **Verification is advisory.** The harness keeps verifying facts (the assignee's clone,
   the PR on GitHub, the deploy log) and stores `verifiedStatus` + `verifiedAt`. When the
   verified state is LOWER than the card's status the card carries a warning badge
   ("claimed pr-merged, verified: doing — branch not on origin"), exposed by `list_tasks`
   as `unverified` + `warning` and on the Kanban as "⚠ unverified". When verification
   catches up the badge clears; when it EXCEEDS the status the harness advances the card
   (forward-only auto-advance stays). The stale guard keeps working off verified facts.
3. **Verification does not depend on the assignee's machine for PR facts** — delivered
   by openspec board-verify-remote (PR #75, included here): any card that names a PR is
   verified against GitHub; a merged PR is proof of pr-merged even when the branch was
   deleted on origin; done when the merge is live in the hub's or the assignee's build.
4. **One-shot "Re-verify board"** — `POST /api/taskgraph/verify` and the Kanban button
   (board-verify-remote); after it the nine stuck cards show pr-merged or done with no
   warning. A card that says done but is verified less keeps being checked until the
   facts catch up (it used to be skipped).
5. **Migration keeps statuses.** A pre-lifecycle "done" without merge evidence stays done
   with the badge instead of being re-staged to committed.
6. **Role prompt v9**: update_task moves the card; the harness annotates; the arch reports
   unverified cards to the Operator instead of moving them back.

## Non-goals

No change to the Kanban columns; no change to the closing-line contract; relaying
commit/push facts from a peer's own clone stays the board-verify-remote follow-up.
