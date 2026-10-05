## ADDED Requirements

### Requirement: The Repo Agent Requests tab offers Approve → drive as goal
A pending card SHALL offer "Approve → arch chat" (one message) and "Approve → drive as goal"
(a bounded goal conversation), with a hint saying which is for a one-step ask and which for
anything multi-step. A request driven by a goal SHALL show "approved · goal <state>" and the
goal conversation's name with its polls against the cap, read from the same endpoint.

#### Scenario: Drive as goal from the tab
- **WHEN** the Operator clicks "Approve → drive as goal" on a pending card
- **THEN** `POST /api/arch/requests/{id}/approve` is sent once with `drive: true` and the card shows approved · goal running and names the goal conversation
