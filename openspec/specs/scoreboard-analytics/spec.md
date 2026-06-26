# scoreboard-analytics Specification

## Purpose
TBD - created by archiving change scoreboard-render-all. Update Purpose after archive.
## Requirements
### Requirement: Window-scoped run analytics

The system SHALL serve the Scoreboard's metrics from the `activity.jsonl` run
ledger via `GET /api/analytics?window=`, scoping every metric to the requested
window. The `window` query value SHALL be one of `today`, `7d`, or `all`; any
other value SHALL be treated as `all`. The response SHALL include the longest run,
peak concurrency, prompt count, total work time, total cost, total runs, a
concurrency-over-time series, a per-agent leaderboard, and a per-day activity
series, all consistent with the same window.

#### Scenario: Default and unknown windows

- **WHEN** a client requests `/api/analytics` with no window, or with a value that
  is not `today`, `7d`, or `all`
- **THEN** the system computes the metrics over the `all` window (the full retained
  ledger)

#### Scenario: Scalars scoped to the window

- **WHEN** a client requests `/api/analytics?window=7d`
- **THEN** the prompt count, total work time, total cost, longest run, peak
  concurrency, and total runs reflect only runs touching the trailing 7-day span

### Requirement: Activity strip spans the selected window

The per-day activity series (`daily[]`) returned by `GET /api/analytics` SHALL span
the selected window rather than a fixed trailing 7 calendar days. The series SHALL
contain one entry per calendar day, ordered oldest to newest, where each entry
reports that day's prompt count and work time (clipped to the day). The day count
SHALL be variable, determined by the window:

- `today` → exactly the current calendar day,
- `7d` → the trailing 7 calendar days (including today),
- `all` → every calendar day from the earliest recorded run through today,
  inclusive.

When the ledger contains no runs, the series for `all` SHALL fall back to a single
entry for the current day rather than an empty or inverted range. Days are bounded
by host-local midnight, consistent with the rest of the analytics.

#### Scenario: All window spans full history

- **WHEN** the ledger's earliest run is N calendar days before today and a client
  requests `/api/analytics?window=all`
- **THEN** `daily[]` contains N+1 entries, one per calendar day from that earliest
  run's day through today, oldest to newest

#### Scenario: Seven-day window keeps a week

- **WHEN** a client requests `/api/analytics?window=7d`
- **THEN** `daily[]` contains exactly 7 entries for the trailing 7 calendar days
  including today

#### Scenario: Today window is a single day

- **WHEN** a client requests `/api/analytics?window=today`
- **THEN** `daily[]` contains exactly 1 entry, for the current calendar day

#### Scenario: Empty ledger on all window

- **WHEN** the ledger contains no runs and a client requests
  `/api/analytics?window=all`
- **THEN** `daily[]` contains a single entry for the current calendar day with zero
  prompts and zero work time

### Requirement: Scoreboard renders the full activity span

The Scoreboard panel SHALL render one activity bar per entry in `daily[]` without
assuming a fixed count of 7, and SHALL label the strip with the span actually shown
(reflecting the selected window). The layout SHALL remain readable as the number of
bars grows (e.g. by wrapping or horizontal scroll) so that selecting the `all`
window shows the full retained history rather than a truncated week.

#### Scenario: All window renders every day

- **WHEN** the user selects the `all` window and the response `daily[]` has more
  than 7 entries
- **THEN** the activity strip renders one bar per entry, not just the last 7

#### Scenario: Strip label reflects the window

- **WHEN** the user switches the window toggle between `today`, `7d`, and `all`
- **THEN** the activity strip's bar count and label update to match the span of the
  returned `daily[]`

