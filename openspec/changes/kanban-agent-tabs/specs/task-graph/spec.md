# task-graph — delta for kanban-agent-tabs

## REMOVED Requirements

### Requirement: Kanban cards open their assignee in one reused worker window
**Reason**: Superseded — the Operator wants one tab PER agent, focused in
place wherever it lives, not one shared window renavigated on every click.
**Migration**: The assignee chip itself is now the click target; the deep link
and peer-registry URL derivation carry over unchanged into the replacing
requirement below.

## ADDED Requirements

### Requirement: Kanban cards focus their assignee's own agent tab
Each assignee chip on a Kanban card SHALL be a click target that focuses that
repo agent's OWN browser tab — one named tab per agent (`birocode-agent-<key>`,
key sanitized, stable, distinct per assignee) — wherever that tab currently
lives, including a Chrome window on another monitor. If the agent's tab does
not exist yet the click SHALL open it at that assignee's machine harness with
that repo agent's dock active; if it already exists the click SHALL focus it
AS-IS, without navigating or reloading it. The target URL SHALL be derived
from the same peer-registry address the Fleet Status "open harness" link uses
(self: this harness's root, proxy-prefix aware) plus the deep link carrying
the target machine's own repoId; when the machine's address is not known the
chip SHALL NOT be clickable rather than a guessed or broken link. On a
multi-assignee card each chip SHALL target its own agent's tab.

#### Scenario: Two agents, two tabs, clicks switch between them
- **WHEN** the Operator clicks agent A's chip, then agent B's chip, then agent A's chip again
- **THEN** A and B each get exactly one tab, and the third click focuses A's existing tab without opening another and without reloading it

#### Scenario: The tab was dragged into another Chrome window
- **WHEN** an agent's tab has been moved into a different Chrome OS window (e.g. on a second screen) and its chip is clicked
- **THEN** that existing tab is found and focused in the window it lives in — no duplicate tab, no reload

#### Scenario: Unknown machine degrades gracefully
- **WHEN** a card's assignee is on a machine whose address the hub does not know
- **THEN** that assignee's chip is not clickable and shows no jump cue
