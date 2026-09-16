## ADDED Requirements

### Requirement: The Board check is a visible, journaled mechanism with its own name
The auto-verifier and its mechanical judge (the Board check) SHALL stamp and clear flags under their
own actor name, distinct from the policeman conversation's, and SHALL never clear a flag they did
not raise. Every verifier pass SHALL be journaled with its time, trigger (startup · timer ·
operator · policeman), duration, cards checked and probed, every card moved (from → to), every flag
raised or cleared, the verdict counts, and any error; quiet passes MAY be folded into a run whose
span and repeat count are kept, while the total pass count stays exact. The journal SHALL be bounded
and SHALL survive a restart. The Kanban SHALL offer a Board check subtab beside the Policeman that
shows what the loop is, its state and timing, the live verdict, the journal, a per-card timeline,
what it writes on a card, what it never does, and the two checkers side by side.

#### Scenario: A stuck card is flagged by the Board check, not "the policeman"
- **WHEN** the judge finds a card pinged with no PR and silent past the window
- **THEN** the card carries 🆘 by `board-check`, the Board check section names the auto-verifier, and the journal's entry for that pass lists the card under "raised"

#### Scenario: The judge leaves the policeman conversation's flag alone
- **WHEN** the policeman conversation has flagged a card for a reason of its own and the card is not mechanically stuck
- **THEN** the next Board check pass does not clear that flag

#### Scenario: A quiet hour is one row
- **WHEN** sixty consecutive minute passes move nothing, change no flag and reach the same verdict
- **THEN** the history shows one row spanning the hour with a repeat count of sixty, and the pass total has grown by sixty

#### Scenario: A card's own timeline
- **WHEN** the Operator picks a card in the Board check subtab
- **THEN** only the passes that moved, flagged or unflagged that card are listed, newest first

#### Scenario: A failed pass is still on the record
- **WHEN** a pass throws (for example GitHub is unreachable)
- **THEN** the journal records the pass with its trigger and the error, marked as failed in the subtab
