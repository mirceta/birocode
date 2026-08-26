## ADDED Requirements

### Requirement: Tools lane in the agent dock

The agent dock's lane switcher SHALL offer a **Tools** lane as a sibling of the existing
Builder, Ask, Files, Console, and OpenSpec lanes. Selecting the Tools lane SHALL display
the per-repo tool configuration panel (the surface where MCP tools such as the Birokrat
API server are enabled and parameterized) rendered over the chat, with the composer
remaining below — the same overlay behavior as the Files, Console, and OpenSpec lanes.
Selecting any other lane, or opening a local app, SHALL swap back out of the Tools view.
The lane SHALL be gated by an Advanced-default capability flag, consistent with the other
sibling lanes, so Basic mode does not show it unless the operator opts in.

#### Scenario: The Tools lane appears beside the other lanes

- **WHEN** an operator views an agent dock in Advanced mode
- **THEN** the lane switcher shows a Tools lane alongside Builder, Ask, Files, Console,
  and OpenSpec

#### Scenario: Selecting Tools shows the tool panel over the chat

- **WHEN** the operator selects the Tools lane on a dock
- **THEN** the tool configuration panel is shown over the chat while the composer remains
  below, and selecting another lane or opening a local app swaps back out of it

#### Scenario: The lane is hidden in Basic mode by default

- **WHEN** the dock is viewed in Basic mode and the operator has not enabled the lane
- **THEN** the Tools lane is not shown

### Requirement: The Tools lane is scoped to the dock's own repository

The tool configuration shown and edited in a dock's Tools lane SHALL be the configuration
of **that dock's repository**, independent of the harness's global repo selection. Two
docks bound to two different repositories SHALL each show and edit their own repository's
tool configuration at the same time.

#### Scenario: Each dock edits its own repository's tool configuration

- **WHEN** two docks bound to different repositories both have the Tools lane selected
- **THEN** each dock's panel reflects and edits its own repository's tool configuration,
  not the other's and not the globally selected repository's
