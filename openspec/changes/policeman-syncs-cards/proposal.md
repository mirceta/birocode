# The policeman moves a card to the facts — never by claim

## Why

The Operator (2026-09-16): "Supposedly it can only flag stuff? That's wrong — it should be
able to figure out that a task has an opened pull request and can be tracked back to a
card, and if the card is in a progress column it should be able to move it to the PR
opened column."

Today the verifier already ADVANCES a card when the facts on its *recorded* branch or PR
are ahead of its column. The case the Operator describes is a card with no linkage
recorded at all — the agent never relayed `TASK COMMITTED` / `TASK PR`, the arch never
called update_task with the branch or PR — so the verifier has nowhere to look, and the
card sits in Doing while its PR is open on GitHub. The policeman could see it (it reads
transcripts) but had no way to act on it: its only powers were flag and clear.

## What changes

Two tools, one rule: the policeman may move a card **to what the facts prove, forward
only** — never by opinion, never backwards.

- **`list_pull_requests(machine, repoId, state=open)`** — the pull requests of one managed
  repo's GitHub remote (`gh pr list`, no clone needed), each **traced back to the card it
  delivers** by the pure `PrTrace` rules, strongest first: an assignee records that PR →
  records that head branch → the PR's title/body/branch names the card's `#ref` → the
  titles contain each other (a guess, marked `sure = false`). Delivered and manual cards
  are never candidates; a tie is no match. Each traced PR says whether the card is
  **behind** it (Doing while the PR is open; PR open while it is merged).
- **`sync_card(id, pr?, branch?, assignee?)`** — records the linkage on the card (or the
  named assignee) and runs **one verifier pass now** — exactly what the Operator's
  "Re-verify board" runs. The *harness* moves the card, by the same forward-only
  observation rule as always; the tool answers `moved | linked | unchanged` with the
  reason. Refused on a manual card.
- The policeman's prompt gains the step: for each managed repo list the PRs, sync every
  card that sits behind its PR, be explicit about title-only traces; a card that says MORE
  than the facts still stays put and is reported as dishonest. Its allowed set grows from
  13 to 15 tools; the 14 acting tools stay withheld.
- The arch gets both tools too (they are in the catalogue): list_pull_requests is a read,
  sync_card cannot do anything update_task could not.

## Impact

- `PrTrace` (new, pure), `IPrFactsProbe.ListPrs` (+ gh implementation),
  `ArchAgentService.Policeman` (+ `IPrFactsProbe`, `TaskVerificationPoller` dependencies),
  `ArchMcpServer` catalogue, `ArchPoliceman` policy + prompt.
- Client wording only (Policeman subtab empty state, Tools lane intro); evidence counts.
- Tests: `PrTraceTests` (tracing order, scoping, ties, and the link-then-verify mechanism),
  `ArchPolicemanTests` (policy + prompt).
- Spec: `arch-agent`. Builds on `policeman-tool-surface`.
