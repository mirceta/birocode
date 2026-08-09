# chat — delta

The autopilot engine needs a first-hand record of what a turn streamed, because
the CLI can complete a run without persisting its reply to the transcript
(observed live 2026-07-31, twice).

## ADDED Requirements

### Requirement: A run session retains the turn's streamed reply text

A run session SHALL accumulate the visible reply text of its turn (the streamed
token events) and the time the last of it arrived, and SHALL expose both to
backend consumers for the lifetime of the session object — surviving the run's
completion until the next run replaces the session. This is a read surface
only: it SHALL NOT alter the event stream clients consume.

#### Scenario: Completed run still serves its reply text

- **WHEN** a builder-lane run completes after streaming reply text
- **THEN** the session object reports that text and its arrival time until a new run for the repo begins
