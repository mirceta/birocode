# management-dashboard — delta for status-filter-agent-name

## ADDED Requirements

### Requirement: The Status text filter matches the agent's name in every visible form
The Status tab's filter bar SHALL include a text box that filters agents live,
as the user types: an agent survives when every whitespace-separated word of
the query is a case-insensitive substring of that agent's searchable text,
which SHALL include the agent's repo name, its full fleet handle, and the
label the chip visibly shows (the handle-derived repo-agent part), alongside
the branch, remote URL and machine label. The text box SHALL compose with the
machine chips and the state filter buttons — every active constraint applies
at once — and an empty box SHALL filter nothing.

#### Scenario: Typing the label printed on a chip keeps that chip
- **WHEN** an agent's chip shows "web-flow-autodev#1" (handle "MONSTER/web-flow-autodev#1", repo name "web-flow-autodev") and the user types "autodev#1"
- **THEN** that agent stays visible and agents not matching are filtered out, machines with nothing left collapsing to their headers

#### Scenario: The textbox composes with the button filters
- **WHEN** the user types a query matching two agents on one machine and then presses the "occupied" state chip while one of the two is occupied
- **THEN** only the occupied matching agent remains, and clearing the filters restores every agent
