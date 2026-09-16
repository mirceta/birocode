## ADDED Requirements

### Requirement: One policeman — a code loop with one model question per card (proposal)
The board SHALL have one policeman: the Board check's loop, which every interval reads the facts
for every in-flight card, traces pull requests to cards itself, moves cards forward to the facts,
and, for each card whose assignee has messages newer than its last observation, asks the model
exactly one stateless question — which of the observation states the agent is in, and why, in one
line — validates the answer, writes the Agent section under the loop's own name, and flags by rule
informed by that reading. The policeman conversation, its prompt, its sessions, its tool fences and
its recipe loop SHALL be retired; escalation SHALL live on the card. Every model question SHALL be
journaled beside the pass that asked it.

#### Scenario: A card behind its PR is moved without a model
- **WHEN** a pull request whose head branch or title traces to a card is open on GitHub and the card sits in Doing
- **THEN** the next pass moves the card to PR open and journals the move, with no model call

#### Scenario: New words from an agent become one observation
- **WHEN** an assignee has posted messages since the card's last observation
- **THEN** the pass asks the model one question about those messages, writes the chosen state and one-line reason on the card as the loop's, and journals the question, the answer and the tokens used

#### Scenario: Nothing new, nothing asked
- **WHEN** no assignee of a card has posted since its last observation
- **THEN** the pass moves and judges the card by the facts alone and asks the model nothing
