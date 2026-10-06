# management-dashboard — delta for status-agent-dblclick

## ADDED Requirements

### Requirement: Double-clicking an agent chip opens its harness directly
On the Status tab's Agents subtab, double-clicking a repo agent chip SHALL
open that agent's harness through exactly the shared open-harness logic (the
Kanban badge's tab key and studio deep link, the Settings-chosen harness
window, one browser tab per agent, focus without reload on a repeat
double-click) — never a second implementation. A single click SHALL keep
toggling the agent's details, and a double-click SHALL NOT leave the details
in a different open/closed state than before it. The chip's tooltip SHALL
hint that double-click opens the harness. The gesture SHALL work in both the
split and the merged layout; an agent on a machine whose address is unknown
SHALL have no double-click action and no hint.

#### Scenario: One gesture instead of two steps
- **WHEN** the Operator double-clicks an agent chip whose details are closed
- **THEN** the agent's named harness tab opens at its machine's studio deep link and is focused, and the details are still closed afterwards; a second double-click focuses the existing tab without reloading it

#### Scenario: Nothing else on the subtab changes
- **WHEN** the Operator single-clicks a chip, or presses the ✓ "mark as checked" beside a finished chip
- **THEN** the details toggle exactly as before, and the ✓ performs only its acknowledgement — no harness opens
