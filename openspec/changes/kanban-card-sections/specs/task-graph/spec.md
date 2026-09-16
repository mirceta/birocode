## ADDED Requirements

### Requirement: A Kanban card explains itself in labeled sections
Every Kanban card SHALL be rendered as labeled sections rather than a row of badges: a
header (reference, editable title, assignees), a **Progress** row showing the delivery
lifecycle as steps with the current step lit, a **Board check** section carrying exactly one
status, and a collapsible **Links** section (branch, pull request, verified state, pings,
dependencies, origin). The Board check status SHALL be one of ✅ Honest, ⚠️ Not verified
yet, 🆘 Needs human, 🔧 Manual — in that precedence reversed (manual wins, then needs human,
then not verified) — SHALL be phrased in plain English, and SHALL always name its source
(the auto-verifier's git & PR facts, the policeman, the agent, or the Operator) and, when
known, when it was set. A raw reason string from the verifier or the policeman SHALL NOT
be rendered on the card; the reason SHALL be rewritten in words.

#### Scenario: A card whose column is ahead of the facts
- **WHEN** a card sits in PR open while the verifier has confirmed only Doing
- **THEN** its Board check reads "⚠️ Not verified yet — marked PR open, but no pull request has been found on GitHub yet — the auto-verifier (git & PR facts)", the PR open step is lit amber, and the words "column ahead of reality" appear nowhere on the card

#### Scenario: The policeman flagged the card
- **WHEN** the policeman stamped a card "human assistance requested" with a reason
- **THEN** its Board check reads "🆘 Needs human — <that reason> — the policeman, N min ago" with a ✓ Resolve control inline, and pressing Resolve clears it without opening the card

#### Scenario: The rest stays out of the way
- **WHEN** a card has a branch, a pull request and is stale
- **THEN** the Links section is collapsed with the brief "⎇ <branch> · PR #N · stale", and opening it lists Branch, Pull request, Verified, Pinged and Stale with plain notes
