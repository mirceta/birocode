## ADDED Requirements

### Requirement: The Repo Agent Requests tab
The Management App SHALL have a tab `requests` ("Repo Agent Requests", `?tab=requests`) showing
`GET /api/arch/requests`, refreshed every 5 s while visible: the pending requests first — each
with the agent and machine, the title when given, the full text, when it was made, and Approve /
Dismiss, where Dismiss asks for confirmation naming the agent — then the decided ones folded
under a toggle with their decision, who decided and whether an approved one is in the arch chat
or still waiting for its slot; each fleet peer with its last pull status; and the how-to served
by the harness. It SHALL say when approving is refused because the autopilot gate is closed.

#### Scenario: Approve from the tab
- **WHEN** the Operator clicks Approve on a pending card
- **THEN** `POST /api/arch/requests/{id}/approve` is sent once and the card shows approved with its delivery state

#### Scenario: Dismiss asks first
- **WHEN** the Operator clicks Dismiss and then Cancel
- **THEN** nothing is sent and the card stays pending; clicking Dismiss now sends `POST /api/arch/requests/{id}/dismiss` and the card shows dismissed
