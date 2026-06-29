# files

## ADDED Requirements

### Requirement: Hide generated build folders (bin/obj) in the Files tab

The system SHALL provide a toggle, placed next to the folder-tree zoom controls at the bottom of the
Files tab, that hides folders named `bin` or `obj` (and their contents) from the folder tree. When
the toggle is on, those folders SHALL also be excluded from the fuzzy file-search results, so a
hidden folder's files do not surface there. The toggle SHALL default to ON and SHALL persist
device-locally (like the tree-zoom preference); filtering is client-side and does not change the
directory-listing API.

#### Scenario: bin/obj are hidden by default

- **WHEN** the operator opens the Files tab on a C# project with `bin`/`obj` folders
- **THEN** those folders are not shown in the tree and their files do not appear in search results

#### Scenario: Toggling shows them again

- **WHEN** the operator clicks the hide-generated toggle off
- **THEN** `bin` and `obj` folders appear in the tree and in search, and the choice persists across reloads on that device
