# Design — the policeman moves a card to the facts

## D1. The harness moves, the policeman links

`sync_card` never sets a status. It records a branch / PR on the card (`RecordClaim`, the
same linkage `update_task` records for a relayed `TASK PR` line) and calls
`TaskVerificationPoller.VerifyOnce()`. The verifier then does what it always does:
observes GitHub, records the verified state and advances the card forward when the facts
exceed its column. So a card can only ever end up where the facts put it, and the move is
in the verifier's own change log and audit like any other. A closed-without-merge PR does
not demote (observation never demotes); the policeman reports that card as dishonest.

## D2. Tracing is pure and ranked

`PrTrace.Trace(pr, nodes, repoId?)` → `Match(node, how, strength)`:

| strength | evidence |
|---|---|
| 4 | an assignee (or the unassigned card) records this PR's URL or number |
| 3 | an assignee (or the card) records the PR's head branch |
| 2 | the PR title, body or head branch contains the card's 8-hex `#ref` |
| 1 | the PR title contains the card title, or vice versa (≥ 8 chars each) |

Delivered (`pr-merged`, `done`) and manual cards are skipped. The strongest wins; a tie at
the same strength returns null so the policeman says "could not trace" instead of
guessing. `sure = strength ≥ 2`. `repoId` scopes strengths 4 and 3 to assignees on that
repo (a card with two assignees on two repos traces per repo).

## D3. Where gh runs

`GitTaskFactsProbe.ListPrs` runs `gh pr list --repo owner/repo --state … --json …` from the
temp dir, like `ProbePr`: no clone needed, so a fleet repo this hub has not checked out
still lists. `owner/repo` comes from the managed repo's remote URL (local: the clone's
origin, cached; remote: what the peer reported). No GitHub remote → `no-github-remote`.
Bodies are clipped to 600 chars. The interface method has a default body (empty list) so
the test fakes stay untouched.

## D4. Not changed

The tool surface fences of `policeman-tool-surface` (tools/list, CLI, call-time) apply as
before with the two tools added to the allowed set. `update_task` stays withheld: the
policeman still cannot move a card by claim. The Kanban card's Board check does not need a
new state — a card behind its PR is honest (it claims less than the facts) and simply
gets moved.
