## ADDED Requirements

### Requirement: Resizable side column and Fleet lane

The Arch surface SHALL let the operator resize and hide the side column that holds
the Loop, Managed agents, Fleet and Home repo cards, and SHALL offer those cards as
a fourth lane ("Fleet") beside Chat, Tools and History.

#### Scenario: Resizing the side column

- **WHEN** the operator drags the divider between the conversation and the side column
- **THEN** the column's width follows the pointer within its limits and the width is
  remembered on that device

#### Scenario: Hiding the side column

- **WHEN** the operator hides the side column from the lane bar
- **THEN** the conversation takes the full width, the choice is remembered, and the
  cards remain reachable in the Fleet lane

#### Scenario: Fleet lane

- **WHEN** the operator opens the Fleet lane
- **THEN** the same cards render full width as a grid and the side column is not shown
  beside them
