# traffic-monitor — delta spec

## ADDED Requirements

### Requirement: All harness HTTP traffic is measured automatically
The harness SHALL count every HTTP request it serves — including static files,
`/api/*`, and localview/preview proxy traffic — recording request count, request
bytes, and response bytes, via middleware that requires no per-endpoint opt-in.
Response bytes MUST be counted even for chunked/streamed responses (no
Content-Length), and counting MUST NOT buffer or delay streamed responses.

#### Scenario: Streamed response is counted without breaking streaming
- **WHEN** a chat SSE stream sends 300 KB over its lifetime
- **THEN** roughly 300 KB is attributed to that endpoint's bucket, and the client
  receives the stream incrementally exactly as before

#### Scenario: Static and proxied traffic is included
- **WHEN** the SPA loads assets and the Local tab pulls from a localview proxy path
- **THEN** those bytes appear in the traffic stats, not only controller responses

### Requirement: Traffic is attributed to endpoint buckets with bounded cardinality
The harness SHALL aggregate traffic per endpoint bucket keyed by method plus route
shape (route template for controllers; normalized path prefix otherwise), so distinct
resource IDs share one bucket. The bucket table MUST be bounded (overflow lumped into
an `other` bucket).

#### Scenario: Same route, different IDs, one bucket
- **WHEN** the client polls `/api/repos/A/events` and `/api/repos/B/events`
- **THEN** both are counted in the single `GET api/repos/{repoId}/events` bucket

### Requirement: Rolling rates via GET /api/traffic
The harness SHALL expose `GET /api/traffic` (password-gated like all `/api/*`)
returning current requests/sec and bytes/sec computed over rolling windows from
in-memory 1-second slots, at least 60 seconds of 1-second history suitable for a
sparkline, and the top endpoint buckets by response bytes over the last 60 seconds.
Stats MAY reset on harness restart; no persistence is required.

#### Scenario: Rates reflect recent traffic only
- **WHEN** a burst of polling stops for two minutes
- **THEN** `/api/traffic` reports near-zero current rates even though lifetime totals
  were high

### Requirement: High-throughput signal
The harness SHALL mark the traffic report `high` when sustained response throughput
over the last 60 seconds exceeds a configurable threshold
(`TrafficHighBytesPerSec` in appsettings/AppConfig, with a built-in default), and the signal
MUST be computed server-side so all consumers share one definition.

#### Scenario: Sustained load crosses the threshold
- **WHEN** average bytes-out/sec over the last 60s exceeds the configured threshold
- **THEN** the API response carries `high: true` and the threshold value it used

### Requirement: Dashboard Traffic panel
The web UI SHALL offer a Traffic panel as a standard summonable, draggable,
collapsible Dashboard dock panel, defaulting to Advanced mode in the UI-mode
capability map. It SHALL show current req/s and KB/s (visible even when collapsed),
a ~60s throughput sparkline with the threshold marked, and the top endpoint buckets.
It SHALL poll `/api/traffic` at the dock cadence (5s) only while mounted and the
page is visible, and it SHALL surface the `high` signal visibly (panel tint and rail
chip indicator).

#### Scenario: Operator watches throughput rise
- **WHEN** the operator opens extra tabs and sustained throughput crosses the threshold
- **THEN** within one poll cycle the panel shows the elevated KB/s and switches to its
  high state

#### Scenario: Panel absent in Basic mode
- **WHEN** the device is in Basic (Simple) UI mode
- **THEN** the Traffic panel and its rail chip are not offered
