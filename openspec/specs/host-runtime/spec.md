# host-runtime Specification

## Purpose
TBD - created by archiving change fix-startup-handle-race. Update Purpose after archive.
## Requirements
### Requirement: UI handles are created only on the UI thread
The harness SHALL create the monitoring form and force its native window
handle on the main STA thread **before** starting the embedded web API, and
any cross-thread UI marshalling helper SHALL refuse to execute UI work while
the form's handle does not yet exist (dropping the update) instead of running
it inline on the calling thread.

#### Scenario: Background event fires during startup
- **WHEN** a log or call event fires from a threadpool thread while the API is
  already serving requests during process startup
- **THEN** no control handle is created on that thread, the GUI later shows
  and pumps normally, and at worst the single early monitoring update is dropped

#### Scenario: API starts only after the form handle exists
- **WHEN** the harness process starts
- **THEN** the monitoring form's window handle is created on the main thread
  before the embedded API accepts its first request

### Requirement: Hosted background services are immune to UI synchronization context
Hosted background services (autopilot engine, collector poller) SHALL await
with `ConfigureAwait(false)` in their execution loops so their continuations
resume on the threadpool regardless of any ambient synchronization context.

#### Scenario: Engine ticks even with a phantom UI context
- **WHEN** a `WindowsFormsSynchronizationContext` is ambient on the thread that
  starts a hosted service
- **THEN** the service's delay continuations still resume on the threadpool and
  ticks proceed on schedule

### Requirement: Loop engine tick path never blocks on transcript mining
The autopilot engine's routine-set lookup SHALL return immediately from the
cached mining result, refreshing the cache via a single-flight background
task; concurrent callers SHALL NOT trigger duplicate mining scans.

#### Scenario: Loop armed right after process start
- **WHEN** a loop is armed within seconds of harness startup, before the first
  transcript-mining pass has completed
- **THEN** the engine ticks the loop on its normal interval using the user's
  custom prompts as the label space, and mining progress/completion is logged

#### Scenario: Two API callers hit a stale mining cache
- **WHEN** two requests that need the routine set arrive while the cache is stale
- **THEN** at most one mining scan runs and both requests return without
  waiting for it

### Requirement: CLI output reading parks no threads
The CLI runner SHALL consume child-process stdout with asynchronous reads
terminated by end-of-stream (null line), not by synchronous stream polling.

#### Scenario: Active CLI run with quiet stdout
- **WHEN** a CLI run is active but has produced no output for a while
- **THEN** no threadpool thread is blocked waiting on the pipe

