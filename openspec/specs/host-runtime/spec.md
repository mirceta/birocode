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

### Requirement: Transcript reads are incremental and cached

The harness SHALL NOT re-parse a session transcript from byte zero on every
read. It SHALL keep, per transcript file, the bytes consumed so far together
with the accumulated parse result, and on a subsequent read SHALL (a) return the
cached result when the file's length and last-write time are unchanged, (b)
parse only the newly appended complete lines when the file has grown, and (c)
re-parse from the beginning only when the file shrank or was rewritten in place.
Only lines terminated by a newline SHALL be consumed, so a line still being
written by the CLI is never read half-way. Malformed lines and NUL padding are
skipped exactly as before. The cache SHALL be bounded (least-recently-used
eviction) and an evicted transcript SHALL simply re-parse in full on its next
read.

#### Scenario: Idle page polls a large running transcript

- **WHEN** the web UI requests a session's messages every 5 s while the CLI
  appends to that transcript
- **THEN** each request that finds the file unchanged costs one file stat and
  no reads, and each request that finds it grown reads only the appended bytes

#### Scenario: Tool result lands after its tool use

- **WHEN** a transcript is read after an assistant `tool_use` line and again
  after the matching `tool_result` line has been appended
- **THEN** the second read pairs the result with the earlier call without
  re-reading the earlier bytes

#### Scenario: Transcript rewritten in place

- **WHEN** a transcript's length is unchanged but its last-write time moved (an
  in-place repair) or its length decreased
- **THEN** the next read discards the cached state and parses from the start

### Requirement: Git status is memoized and process spawning is bounded

`GitService.Status` without fetch SHALL serve a cached result for the same
working directory for 5 s, computing it at most once for concurrent callers
(single-flight). A mutating git action through the service SHALL invalidate the
memo for its directory. `Status` with fetch SHALL bypass and refresh the memo.
The service SHALL bound concurrent `git` processes with a small semaphore.

#### Scenario: Arch tick reads availability for several repos

- **WHEN** the arch loop and the arch state endpoint both need git state for the
  same repo within 5 s
- **THEN** one `git status` process runs, not one per caller

### Requirement: Log and audit writers keep their file handle open

The harness logger and the audit services SHALL append through a kept-open
writer (shared read so the operator can tail the file) rather than opening and
closing the file for every line, and SHALL re-open the writer on a write
failure.

#### Scenario: Burst of log lines

- **WHEN** a hundred log lines are written within a second
- **THEN** the log file is opened at most once (plus any re-open after a failure)

### Requirement: Autopilot mining is incremental

The discovery pass SHALL keep each session's mined contribution keyed by the
transcript's length and last-write time and SHALL re-parse only transcripts
whose key changed; contributions of transcripts that no longer exist SHALL be
dropped.

#### Scenario: Five-minute refresh with nothing new

- **WHEN** the mining refresh runs and no transcript changed since the last pass
- **THEN** no transcript file is read; the pass costs one stat per file

