# Design — board verifier for remote assignees

## D1. One pass, two sources, forward-only

`BoardVerifier.VerifyOnce` walks every card that is not `done`:

1. **Local facts** (unchanged): a card assigned to a repo on this machine with a
   recorded branch is probed in its clone (`ITaskFactsProbe`) — commits, pushed, PR,
   merge live per the deploy log.
2. **PR facts** (new): if the card is still below `pr-merged` and a PR can be named,
   GitHub is asked (`IPrFactsProbe.ProbePr`): by number (`gh pr view N --repo o/r`) when
   the PR URL or number is known, else by head branch (`gh pr list --repo o/r --head b`).
   The reply becomes `TaskLifecycle.Facts` — `HasCommits`/`OnOrigin` true (a PR implies
   both), `PrMerged` from the state, `MergeCommit`, `HeadCommit` from `headRefOid`
   (which survives the branch's deletion) — and goes through the existing
   `ApplyVerification`, so the never-demote rule is the same one.

`gh` runs from the temp dir, so no clone of the repo is needed to ask about a PR.

## D2. Naming the PR

- the card's `PrUrl` (`https://github.com/o/r/pull/N` → `o/r`, N) wins;
- else the assignee repo's GitHub remote: for a remote assignee from the fleet cache
  (`ITaskFleetInfo.Assignee(sourceId, repoId).RemoteUrl`, the peer's last describe,
  never a blocking call); for a local one from `git remote get-url origin`;
  with the card's `PrNumber` if it has one, else its `Branch`;
- no GitHub remote or nothing to search by → the card is left alone (a note says so).

## D3. "Live" for a merged PR

`done` means the merge is live where the work was done. The hub judges this from:

- a local clone of the same `owner/repo` (any registered repo whose origin reduces to
  it): no clone → `pr-merged` only (a note says why);
- the clone is not a deployed harness (no `swap.ps1`) → merged is live enough → `done`;
- the clone is a deployed harness → the merge commit must be an ancestor of a **live
  commit**: the assignee peer's build (`+<sha>` of its reported version, from the fleet
  cache) or this hub's own build (`ITaskFleetInfo.HubLiveCommit`). Judged with
  `git merge-base --is-ancestor` in the clone; a commit the clone does not know yet is
  "not proven" (null), not "no".

A card already verified `pr-merged` with a merge commit skips `gh` on later passes and
only re-asks the live question, so the minute tick costs no GitHub calls for it.

## D4. Backfill and on demand

The hosted poller runs a pass immediately at startup (that pass is the backfill after a
deploy) and every 60 s. `POST /api/taskgraph/verify` runs one pass now through the
same singleton, serialised by a lock so passes never overlap, and returns
`{ checked, probed, changes[{id,title,from,to}], notes, at }`. The Kanban head gets a
"↻ Re-verify board" button that calls it and shows what moved.

## D5. Warning

`ApplyVerification` clears `Warning` once the verified status reaches `pr-merged`.

## D6. Follow-up: peer relay of commit/push facts

`committed` (branch with commits, not on origin) can only be seen on the assignee's
machine. Each peer's poller already verifies its own local assignees; relaying those
facts to the hub's board (peer API → `ApplyVerification` on the hub) is the follow-up.
This change covers everything from `pr-opened` up for every machine.

## D7. Tests

`TaskBoardVerifierTests`: remote card verified from its PR URL with the branch deleted
(and idempotent on the second pass, no second gh call); remote card found by branch in
the peer's remote → `pr-opened`; a card with no way to name a PR is left alone; merged →
`done` when the merge is in the peer's live build; `pr-merged` until live, then `done`
without asking GitHub again; non-harness repo → `done` at once; local card whose branch
vanished proven by its PR; never demote, done cards skipped; PR URL / remote URL /
build-version parsing.
