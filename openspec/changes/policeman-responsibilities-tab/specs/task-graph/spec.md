## ADDED Requirements

### Requirement: The Policeman tab lists its responsibilities, situation by situation
The Policeman tab SHALL offer a **Responsibilities** view, placed between *What it is* and *How
it works* and remembered per browser like the other views. It SHALL show one table grouped in the
order the pass runs — which cards it polices · trace · facts and move · judge · read · flag ·
clearing and answering — with four columns per row: the card's state, what the conversation says
or the facts show, what the policeman does, and what the Operator sees or what happens next; each
row SHALL name the harness code it is read from. The view SHALL also show the reading vocabulary
(every observation state the card can show, from the same source the card uses) and a filter box
that narrows the rows to those mentioning every typed term, says how many of the rules are shown,
and states plainly when nothing matches. The rows SHALL come from a pure, node-tested module whose
tests pin that every observation state has a row in the read group, that every state that needs
attention has a row in the flag group, and that the quoted numbers (pass cadence, attention
window, sweeps against the facts, trace cadence, questions per pass) are the code's constants.

#### Scenario: A flagged card, explained
- **WHEN** the Operator opens Responsibilities and types "handoff"
- **THEN** only the rows about the handoff ending remain (the reading, the follow-up correlation, the flag after two hours while no follow-up exists, the tracked case with no flag), the count reads "N of M rules", and the vocabulary block is hidden until the filter is cleared

#### Scenario: Nothing matches
- **WHEN** the filter matches no row
- **THEN** the view says that no rule mentions the words, instead of an empty table

#### Scenario: The rules cannot drift silently
- **WHEN** a new observation state is added to the card's vocabulary without a row in the table
- **THEN** the module's test fails
