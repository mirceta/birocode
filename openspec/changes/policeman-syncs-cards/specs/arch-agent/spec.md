## ADDED Requirements

### Requirement: The policeman moves a card to what the facts prove, forward only
The policeman SHALL be able to list the pull requests of a managed repo's GitHub remote,
each traced back to the card it delivers by ranked evidence (a recorded PR, a recorded
head branch, the card's `#ref` in the PR, a title match marked as a guess) with delivered
and manual cards excluded and a tie reported as no trace, and SHALL be able to link a card
to its branch / pull request and have the harness re-verify the board at once. The card
SHALL move only as the verifier's forward-only observation moves it — never backwards,
never by the policeman's claim — and a manual card SHALL be refused.

#### Scenario: A card in Doing whose PR is open
- **WHEN** an agent opened a PR for a card but never relayed it, the card sits in Doing, and the policeman calls list_pull_requests on that repo
- **THEN** the PR is traced to the card and marked behind; calling sync_card with that PR moves the card to PR open on the same call, with the verified state recorded

#### Scenario: A PR that closed without a merge
- **WHEN** the policeman syncs a card whose PR turns out closed and unmerged
- **THEN** the card is not moved backwards; the tool answers unchanged with the reason and the policeman reports the card as dishonest

#### Scenario: A title-only trace
- **WHEN** the only evidence linking a PR to a card is a matching title
- **THEN** the trace is marked not sure, and the policeman's prompt tells it to read both before syncing and to say so in its verdict
