# files

## ADDED Requirements

### Requirement: Hide C# project files (.csproj) in the Files tab

The system SHALL provide a toggle, placed in the same bottom bar as the hide-generated (bin/obj)
toggle at the bottom of the Files tab, that hides files whose name ends in `.csproj` from the folder
tree. When the toggle is on, those files SHALL also be excluded from the fuzzy file-search results.
The toggle SHALL default to OFF (project files shown) and SHALL persist device-locally (like the
hide-generated and tree-zoom preferences); filtering is client-side and does not change the
directory-listing API. This toggle SHALL be independent of the hide-generated toggle.

#### Scenario: .csproj files are shown by default

- **WHEN** the operator opens the Files tab on a C# project with `.csproj` files
- **THEN** those files appear in the tree and in search results, because the toggle defaults to off

#### Scenario: Toggling hides them

- **WHEN** the operator clicks the hide-.csproj toggle on
- **THEN** `.csproj` files disappear from the tree and from search, and the choice persists across reloads on that device
