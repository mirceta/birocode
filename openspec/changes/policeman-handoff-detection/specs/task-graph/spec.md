## ADDED Requirements

### Requirement: The policeman reads a handoff ending and keeps the badge honest
The observation vocabulary SHALL include `handoff` ("Handoff pending"): the agent's last turns
concluded that the next step is a NEW task for a DIFFERENT agent or repo — a handoff or task
description written for someone else, "this needs a <repo> agent to fix X", "create a task
for <someone>", "once their fix is merged I'll pull it" — and no such task exists yet. It
SHALL be read through the same one-question pipeline as every other observation, and the
observation SHALL carry `target` (the repo / agent the follow-up is for, when the words name
it) and `followUpId`. Every pass the sweep SHALL look for the follow-up card the handoff calls
for — a card naming the source card's #ref or id, a card assigned to the resolved target repo
created since the reading less a two-hour look-back, or a card in that window sharing three
significant words with the summary; never the card itself, never a delivered card — and
record it as `followUpId`. A handoff with no follow-up SHALL be flagged 🆘 after the attention
window ("ended in a handoff N ago and no follow-up task exists yet (for <target>): <summary>");
a handoff with a follow-up SHALL never be flagged, and a flag the sweep raised SHALL be
withdrawn once a follow-up is linked. The card's Agent section SHALL read "🤝 Handoff pending —
<summary> — for <target> · no follow-up task on the board yet" with attention styling, or
"Handoff tracked … · follow-up card #ref exists" once linked.

#### Scenario: The web-flow-autodev ending
- **WHEN** the assignee's last message says it wrote a handoff for a prg agent to fix the invoice import and it will pull once their fix is merged, and the reader answers `handoff` with target "prg"
- **THEN** the card shows "🤝 Handoff pending — … — for prg · no follow-up task on the board yet — the arch or you should create it", `list_tasks` carries `observation.state: "handoff"`, `target: "prg"`, `followUpId: null`, and after two hours with no follow-up the card is 🆘 with the reason naming prg

#### Scenario: The follow-up is created
- **WHEN** the arch (or the Operator) creates a card for prg quoting the source card's #ref, or assigned to prg within the window
- **THEN** on the next pass the observation records that card as `followUpId`, the badge reads "Handoff tracked · follow-up card #ref exists", the sweep withdraws its own flag, and the card is never flagged for the handoff again

#### Scenario: Not a handoff
- **WHEN** the agent merely mentions another repo while continuing its own work, or asks the Operator a question
- **THEN** the reader answers working or asked-question as before; nothing about handoffs is stamped
