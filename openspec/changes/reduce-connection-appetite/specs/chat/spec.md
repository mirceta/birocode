## ADDED Requirements

### Requirement: Multiplexed run attachment

The system SHALL provide a single-connection attachment mode for chat runs: one
streaming HTTP response that carries the buffered-and-live events of any requested
set of (repository, lane) runs, each event enveloped with the run it belongs to,
with per-run replay watermarks honored exactly as in single-run attachment. The
web UI SHALL use one shared multiplexed connection for all its run attachments,
and SHALL fall back to per-run attachment automatically when the multiplexed mode
is unavailable (older server) or persistently failing — with no loss of events in
either mode (sequence-number dedup absorbs replay overlap).

#### Scenario: Two running docks share one connection

- **WHEN** two agent docks are running turns at the same time and the dashboard is
  open
- **THEN** both docks' live events arrive over one shared streaming connection,
  and each dock's conversation renders exactly as it would with its own dedicated
  stream

#### Scenario: Subscription set changes mid-stream

- **WHEN** a new run starts (or a dock closes) while the shared connection is open
- **THEN** the client re-establishes the shared connection with the updated
  subscription set and fresh per-run watermarks, and no events are duplicated or
  lost across the switch

#### Scenario: Fallback to per-run attachment

- **WHEN** the multiplexed endpoint returns 404 (older server) or fails repeatedly
- **THEN** the client attaches each run over the existing per-run stream instead,
  preserving today's behavior
