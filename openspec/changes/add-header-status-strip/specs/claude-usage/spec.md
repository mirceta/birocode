# claude-usage Delta

## MODIFIED Requirements

### Requirement: Dashboard Claude chip renders usage

The Claude account chip — hosted in the header status strip — SHALL render the
usage data inside its **expanded** state, below the existing account/plan
rows: one compact meter row for the 5-hour window, one for the weekly quota,
and one per model-scoped weekly entry, each showing utilization percent and
reset time; a severity other than `normal` SHALL be visually distinguished.
The collapsed chip is unchanged. When usage is unavailable the chip SHALL show
a single muted "usage unavailable" line and all identity content SHALL render
exactly as before — a usage failure SHALL NOT affect the account/plan display.
Usage SHALL refresh on the chip's existing poll cadence (now driven by the
header status strip being expanded) against the cached endpoint.

#### Scenario: Usage rows shown in the expanded chip

- **WHEN** the Claude chip is expanded and usage is available
- **THEN** meter rows for the 5-hour window, the weekly quota, and any
  model-scoped weekly limits render with percent and reset time, below the
  account and plan

#### Scenario: Collapsed chip unchanged

- **WHEN** the Claude chip is collapsed
- **THEN** it renders exactly the compact identity indicator it renders today,
  with no usage content

#### Scenario: Unavailable usage degrades without touching identity

- **WHEN** `GET /api/claude-usage` reports `available: false` while the
  account probe reports authenticated
- **THEN** the expanded chip shows the account and plan as today plus a muted
  unavailable line, and no error state is applied to the identity rows

#### Scenario: Elevated severity is visible

- **WHEN** any usage entry reports a severity other than `normal`
- **THEN** that row is visually distinguished from normal rows
