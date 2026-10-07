## ADDED Requirements

### Requirement: Fleet-computer sections on the Status tab sit 5 px apart
Consecutive machine sections on Status → Agents (and the Overview / Scoreboard subtabs, which share the wrapper) SHALL be separated by about 5 px and the first section SHALL carry no extra top space; each section's internal layout SHALL stay as the compact layout defines it. The Management App's stylesheets SHALL NOT share class prefixes across tabs, so one tab's spacing cannot leak into another's.

#### Scenario: Nine machines
- **WHEN** the Operator opens Status → Agents at 1500×1000
- **THEN** sections follow each other with a 5 px gap and one more machine fits above the fold than before
