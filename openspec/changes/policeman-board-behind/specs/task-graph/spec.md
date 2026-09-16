# task-graph — delta for policeman-board-behind

## ADDED Requirements

### Requirement: The policeman discovers unrecorded pushed/merged work (board behind reality)
The policeman's PR trace SHALL consult, besides what the card records, the
branch the harness recorded for each dispatched task at dispatch time (the
assignments store's task-branch watch): a pull request whose head is that
recorded branch SHALL trace to that task's card with the same confidence as a
branch recorded on the card, even when the card records no PR, no branch, and
the PR's text never names the card. A discovered PR SHALL be auto-linked to
the matching assignee so the existing forward-only auto-advance moves the
card; a discovery whose PR is MERGED SHALL be journaled and surfaced as a
"board behind reality — unrecorded merged work" signal, distinct from the
ahead-of-reality (dishonest) signal. When a MERGED PR is discovered but cannot
be linked (the traced card's assignees do not include the listing repo), the
card SHALL be flagged "board behind reality" by the policeman rather than
skipped silently, and that flag SHALL clear once the card records a PR link or
reaches pr-merged. The existing ahead-of-reality and stuck detections SHALL be
unchanged. A merged deliverable SHALL never be left silently showing as
in-progress when the harness's own records suffice to discover it.

#### Scenario: The afed9d6d/#113 regression — merged work, nothing on the card
- **WHEN** a dispatched card sits in doing with no PR or branch recorded, the harness's dispatch watch recorded its task branch, and GitHub has a MERGED PR whose head is that branch (title unrelated, body without the card ref)
- **THEN** one trace pass links the PR to the card's assignee and marks the discovery "board behind reality", and the next verifier pass advances the card to pr-merged

#### Scenario: Discovered but unlinkable merged work is flagged, not skipped
- **WHEN** a MERGED PR traces to a card whose assignees do not include the repo it was listed for
- **THEN** the card is flagged 🆘 "board behind reality — …" by the policeman, and the flag clears once the card records a PR link or reaches pr-merged

#### Scenario: Existing detections unchanged
- **WHEN** a card's column is ahead of the verified facts, or an assignee is silent past the window
- **THEN** the dishonest and stuck judgements read exactly as before
