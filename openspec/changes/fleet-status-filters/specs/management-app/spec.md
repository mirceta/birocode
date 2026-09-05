## ADDED Requirements

### Requirement: Status tab filter bar

The Status tab SHALL show a filter bar under its head with a free-text search over
agent name, branch, remote URL and machine label, one selectable chip per machine
(multi-select, with an "all machines" chip that clears the selection), and the state
chips All · on main · not on main · running · managed. The state chips' counts SHALL
reflect the current machine selection and search, the head SHALL read "N of M
agents" while anything is narrowed, and a clear control SHALL reset the search, the
machine selection and the state chip together. The selection SHALL persist per
device.

#### Scenario: One machine

- **WHEN** the operator clicks the chip of one machine
- **THEN** only that machine's section renders, the state chip counts cover only its
  agents, and the head reads "N of M agents"

#### Scenario: Search narrows

- **WHEN** the operator types part of an agent name into the search box
- **THEN** only agents whose name, branch, URL or machine contains every typed word
  remain, and a machine with no remaining agent collapses to its header line with the
  number hidden by the filter

#### Scenario: Selection survives a reload

- **WHEN** the operator has narrowed the tab and reloads the page
- **THEN** the same search text, machine selection and state chip are applied
