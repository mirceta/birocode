## ADDED Requirements

### Requirement: The Status tab's agent filter accepts several patterns combined with OR
The Fleet Status agent filter box SHALL treat patterns separated by `|` or `,` as alternatives
— an agent matching any of them is kept — ignoring whitespace around the separators and empty
alternatives; inside one pattern whitespace-separated words SHALL all match, each as a
case-insensitive substring, with `*` as a wildcard, and a word typed without separators SHALL
still find the separated name. A single pattern SHALL behave exactly as before; a blank box
SHALL filter nothing. The one helper SHALL feed the machine blocks, the agent chips, the shown
count, the state chips' counts and the split / merged / running views alike. The box SHALL
show how to OR (placeholder and hint), and the value SHALL persist and restore as typed.

#### Scenario: Two kinds at once
- **WHEN** the Operator types "prg | webflow"
- **THEN** every agent whose name contains prg and every agent whose name contains web-flow is listed, the count equals the chips, and "prg, webflow" lists the same
