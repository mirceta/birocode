## ADDED Requirements

### Requirement: Status tab agent chips name the repo agent only

In the Status tab's Agents view, each agent chip's visible label SHALL be the repo
agent's own handle — the `<handle>` part of the fleet's `<machine>/<handle>` label —
without the machine prefix, since the machine is the header of the section the chip sits
under. The chip SHALL still carry the full `<machine>/<handle>` in its hover title and
its `data-handle` attribute, and the label SHALL NOT be truncated on account of the
machine name's length.

#### Scenario: Long machine name

- **WHEN** a machine labelled `DESKTOP-POAPPP3-living-room-workstation` has a repo
  agent with handle `prg#2`
- **THEN** its chip in the Agents view reads `prg#2` in full, under a section header
  reading `DESKTOP-POAPPP3-living-room-workstation`, and hovering the chip shows
  `DESKTOP-POAPPP3-living-room-workstation/prg#2`

#### Scenario: Handles elsewhere unchanged

- **WHEN** the same agent is named by the arch's `list_agents`, a Kanban assignee chip
  or the agent detail row
- **THEN** it still reads `DESKTOP-POAPPP3-living-room-workstation/prg#2`
