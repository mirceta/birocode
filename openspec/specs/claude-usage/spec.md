# claude-usage Specification

## Purpose
TBD - created by archiving change add-claude-usage. Update Purpose after archive.
## Requirements
### Requirement: Probe plan usage from the CLI's subscription session

The system SHALL provide a read-only endpoint `GET /api/claude-usage` that
reports the current Claude plan usage — the **5-hour session window** and the
**weekly quota** (plus any model-scoped weekly limits the upstream reports) —
fetched from Anthropic's OAuth usage endpoint using the `claude` CLI's stored
subscription access token as a bearer credential. The endpoint SHALL return
HTTP `200` in every case with a typed body `{ available, stale, fetchedAt,
session?, weekly?, scopedWeekly[], error? }`, where `session`/`weekly` and
each `scopedWeekly` entry carry `{ percent, resetsAt, severity }` (and a
`label` for scoped entries). Parsing SHALL be tolerant: the upstream
`limits[]` list is the primary source (`kind: session` → `session`,
`weekly_all` → `weekly`, `weekly_scoped` → `scopedWeekly`), the legacy
`five_hour`/`seven_day` fields the fallback, and unknown fields or kinds
SHALL be ignored without error.

#### Scenario: Usage reported for an authenticated session

- **WHEN** the CLI has a valid subscription session and a client requests
  `GET /api/claude-usage`
- **THEN** the response is `200` with `available: true` and the session
  window and weekly quota populated with percent and reset time as reported
  upstream, including any model-scoped weekly entries

#### Scenario: Fails soft when usage cannot be fetched

- **WHEN** the upstream call fails (no network, non-2xx, or an unparseable
  body) and no previous result is cached
- **THEN** the response is `200` with `available: false` and a short `error`
  reason, and the failure is not thrown to the client

#### Scenario: Session expired reported as unavailable

- **WHEN** the stored subscription token is missing or the upstream rejects
  it (e.g. `401`)
- **THEN** the response is `200` with `available: false` and an error reason
  indicating the session, and no retry storm occurs before the next cache
  expiry

#### Scenario: Tolerates upstream schema drift

- **WHEN** the upstream response omits known fields or adds unknown ones
- **THEN** the probe returns the subset it recognises (missing parts null)
  and never throws

### Requirement: Usage results are cached and served stale on error

The usage probe SHALL memoise its result for a cache window of minutes (not
seconds) and SHALL collapse concurrent refreshes into a single upstream call.
When a refresh fails and a previous successful result exists, the endpoint
SHALL serve the previous result marked `stale: true` rather than dropping to
unavailable.

#### Scenario: Dashboard polling does not hammer the upstream

- **WHEN** the dashboard polls `GET /api/claude-usage` many times within the
  cache window
- **THEN** at most one upstream request is made per window and all polls are
  answered from the cache

#### Scenario: Last good result survives a transient failure

- **WHEN** a cache refresh fails after a previously successful fetch
- **THEN** the endpoint returns the previous numbers with `stale: true` and
  `fetchedAt` unchanged

### Requirement: The token is used as a credential only

The usage probe SHALL read the stored OAuth access token only to present it
as a bearer credential to Anthropic's usage endpoint. The token value SHALL
NOT be logged, persisted anywhere else, included in error messages, or
surfaced through any harness API response. Upstream errors SHALL be logged as
status codes / exception types only.

#### Scenario: Token never appears in the response

- **WHEN** a client requests `GET /api/claude-usage` in any probe state
- **THEN** the response body contains only usage metadata and never any part
  of the token

#### Scenario: Token never appears in logs on failure

- **WHEN** the upstream call fails in any way
- **THEN** the log line records the failure without the token value or the
  request's authorization header

### Requirement: Dashboard Claude chip renders usage

The dashboard's Claude account chip SHALL render the usage data inside its
**expanded** state, below the existing account/plan rows: one compact meter
row for the 5-hour window, one for the weekly quota, and one per model-scoped
weekly entry, each showing utilization percent and reset time; a severity
other than `normal` SHALL be visually distinguished. The collapsed chip is
unchanged. When usage is unavailable the chip SHALL show a single muted
"usage unavailable" line and all identity content SHALL render exactly as
before — a usage failure SHALL NOT affect the account/plan display. Usage
SHALL refresh on the dashboard's existing poll cadence against the cached
endpoint.

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

