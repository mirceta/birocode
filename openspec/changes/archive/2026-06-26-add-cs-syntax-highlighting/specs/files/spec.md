## ADDED Requirements

### Requirement: CSharp syntax highlighting in the file viewer

The Files viewer SHALL render a C# source file (a `.cs` file) with C# syntax highlighting that visually distinguishes at least keywords, strings, comments, and numbers, using a palette readable against the viewer's light background, while preserving the file's exact text (adding only presentation). A file whose language the viewer cannot highlight SHALL still render as plain, readable text rather than failing.

#### Scenario: Open a C# file

- **WHEN** the End User opens a `.cs` file in the viewer
- **THEN** its keywords, strings, comments, and numbers are shown in distinct colors
- **AND** the displayed text matches the file's contents exactly

#### Scenario: Unsupported language falls back to plain text

- **WHEN** the End User opens a text file whose language has no highlighter
- **THEN** the file still renders as plain, readable text without error

### Requirement: IDE-style line numbers in the file viewer

The Files viewer SHALL present line numbers in a gutter to the left of the code, as an
IDE does, with each number aligned to its line. The line numbers SHALL NOT be included
when the user selects/copies the code, and SHALL stay aligned to their lines when the
code is scrolled horizontally (i.e. long lines do not wrap so the gutter cannot drift
out of alignment).

#### Scenario: Gutter shows aligned line numbers

- **WHEN** a code file is shown in the viewer
- **THEN** a left gutter lists line numbers 1..N, one per source line, each aligned to its line

#### Scenario: Selecting code excludes the line numbers

- **WHEN** the End User selects and copies the displayed code
- **THEN** the copied text contains the code only, not the gutter line numbers

#### Scenario: Long lines scroll instead of wrapping

- **WHEN** a line is wider than the viewer
- **THEN** the code area scrolls horizontally and each line number stays aligned to its line
