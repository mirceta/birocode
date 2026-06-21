# Files

## Purpose

Gives the End User a browse-and-view surface over the opened Repo — a file tree, a
viewer that renders markdown/images/code, and search — available both in the Files tab
and inside each agent dock.

## Requirements

### Requirement: Browse the repo tree

The system SHALL present the opened Repo as a navigable file tree and open a selected
file in a viewer.

#### Scenario: Open a file

- **WHEN** the End User selects a file in the tree
- **THEN** the Harness shows its contents in the viewer, rendering markdown and images appropriately

### Requirement: Search for a file

The system SHALL let the End User find a file by typing part of its path.

#### Scenario: Fuzzy find

- **WHEN** the End User types part of a file path into the search
- **THEN** matching files are listed, and selecting one opens it in the viewer
