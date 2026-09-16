## ADDED Requirements

### Requirement: The strip shows this machine as the fleet sees it
The expanded header status strip SHALL host a Machine tile that renders this machine's
own overview record — the same record the harness puts in its fleet describe, read from
`GET /api/arch/overview` — with the same rows and unknown reasons the Fleet Status
Overview uses, so the strip and any hub's Overview of this machine can never disagree.
Collapsed, the tile SHALL show a one-line summary (plan, 5-hour and weekly usage, host
time, admin state); it SHALL poll only while the strip is expanded.

#### Scenario: Strip and fleet agree
- **WHEN** the operator expands the strip's Machine tile and opens this machine in a hub's Fleet Status Overview
- **THEN** both show the same values, including the plan usage meters, from the same record

### Requirement: Strip text meets AA contrast
The header status strip's secondary text (labels, summaries, muted rows) SHALL use a
defined muted token with at least 4.5:1 contrast on the strip surface.

#### Scenario: No pale fallback
- **WHEN** the strip renders in Advanced mode on the light theme
- **THEN** its muted text computes to at least 4.5:1 against the strip background
