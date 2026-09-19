## ADDED Requirements

### Requirement: A Kanban badge click honours the dashboard's placement setting
Clicking a repo-agent badge on a Kanban card SHALL consult the Management App's badge-link
placement at click time: in `tabs` mode it SHALL open or focus that agent's own named tab
(unchanged); in `window` mode it SHALL open or reuse the one dedicated harness window with
the chosen screen's features, navigate it to that agent's harness deep link and focus it.
The card and its badges SHALL not change.

#### Scenario: Switching modes takes effect on the next click
- **WHEN** the Operator switches the placement from tabs to window and clicks a badge
- **THEN** that click opens the dedicated harness window rather than a new tab beside the dashboard
