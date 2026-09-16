## ADDED Requirements

### Requirement: The policeman reads every in-flight agent and records what it saw
On every pass the policeman SHALL read the last messages of the assignee of every card in
Doing, Committed or PR open that is not manual, and SHALL record what it read on the card
as an observation from a fixed vocabulary (working, waiting-review, asked-question,
blocked, claims-done, idle, errored) with a one-sentence summary. An observation SHALL
carry who recorded it, when, and the policeman session that did; the policeman SHALL clear
only its own observations; a manual card SHALL be refused. The policeman SHALL check every
repo's pull requests on every pass and move a card behind its PR forward by the facts.

#### Scenario: An agent asked a question nobody answered
- **WHEN** the assignee's last message asks for a credential and the policeman reads it
- **THEN** the card's Agent section reads "❓ Asked a question — <what it asked, when> — seen by the policeman, N min ago · session <id>", and once it has stood past the window the card is also flagged 🆘 by the policeman

#### Scenario: The Operator dismisses a reading
- **WHEN** the Operator presses ✕ on a card's Agent section
- **THEN** the observation is cleared without opening the card, and the policeman may record a fresh one on its next pass

### Requirement: The policeman explains itself in the product
The Policeman subtab SHALL offer a "How it works" view beside the conversation that shows,
from the same data the cards use: what the policeman is, its pass in order, a state-machine
diagram of the Board check and one of the lifecycle naming who may move a card (including
the policeman's forward move by facts), the Agent vocabulary, what it can and cannot do, and
where its provenance lives.

#### Scenario: Reading the diagrams
- **WHEN** the Operator opens How it works
- **THEN** the Board check diagram shows Honest, Not verified yet, Needs human and Manual with labelled transitions naming who causes each, and the lifecycle diagram shows To do → Doing → Committed → PR open → Merged → Done with no backwards arrow
