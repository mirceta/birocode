# fix-startup-handle-race — design

## Context

`Program.Main` currently starts the embedded Kestrel API (`api.Start()`)
*before* constructing `MainForm`. The form subscribes to `Logger`/`CallLog`
events in its constructor, and those events fire from threadpool threads the
instant the API serves a request. `SafeInvoke` marshals with
`if (InvokeRequired) BeginInvoke else action()` — but `Control.InvokeRequired`
is `false` while the control has **no handle yet**, so in the window between
form construction and the main thread's `Application.Run` showing it, a
background event runs `action()` inline. That:

1. creates the form's (and children's) win32 handles on a threadpool thread,
2. installs a `WindowsFormsSynchronizationContext` on that thread,
3. later deadlocks the main thread in `SetParent` (SendMessage to a
   non-pumping thread) when it tries to show the form, and
4. lets `BackgroundService.ExecuteAsync` continuations (started by the Host on
   whatever context is ambient) get posted to the dead message queue — the
   autopilot engine and collector poller freeze at their first `await` while
   Kestrel keeps answering.

Separately, the engine's `Routines()` refreshes its transcript-mining cache
**inline** whenever the 5-min window lapses — the first tick pays ~50 s warm /
~2 min cold, and any concurrent API caller of `Routines()` duplicates the same
scan (no single-flight). And `CliRunnerService` gates its read loop on
`reader.EndOfStream`, a **synchronous blocking** property that parks a
threadpool thread per active CLI run.

## Goals / Non-Goals

**Goals:**
- Make it structurally impossible for UI handles to be born on a non-UI thread.
- Guarantee hosted background services tick regardless of any ambient UI
  synchronization context.
- Make the loop engine's tick path O(cache-read) — never blocked by mining.
- Remove the per-run blocked threadpool thread in the CLI reader.

**Non-Goals:**
- No change to what the autopilot engine *does* per tick (classification,
  gating, sending) — only when it gets to run.
- No queueing/replay of GUI events dropped pre-handle (they are monitoring
  rows/log lines; the GUI's own load paths repopulate on show).
- No general async audit of the codebase beyond the two hosted services and
  the CLI reader loop.

## Decisions

**D1 — Order: construct form + force handle, then start API.**
`Program.Main` creates `MainForm`, forces its native handle on the STA main
thread (`_ = form.Handle`), and only then calls `api.Start()`. Once the handle
exists on the UI thread, `InvokeRequired` is truthful from every other thread
and `BeginInvoke` posts safely (messages queue until `Application.Run` pumps).
Alternative considered: keep the current order and only guard `SafeInvoke` —
rejected as the sole fix because it silently drops early events forever and
leaves the ordering trap for the next event source someone wires up.

**D2 — `SafeInvoke` guards `IsHandleCreated` (drop, not queue).**
Defense in depth for any path that still fires before the handle exists (or
after disposal mid-shutdown). Dropping is correct for monitoring UI: the rows
and counters are recomputed/appended continuously; a replay queue would add
state and ordering questions for zero operator value.

**D3 — `ConfigureAwait(false)` in hosted loops.**
Every `await` in `AutopilotService.ExecuteAsync` / `CollectorPoller.ExecuteAsync`
(and the awaits inside the poll call they drive) gets `ConfigureAwait(false)`.
Even with D1/D2 the host should never depend on the ambient context — a hosted
service strangled by a UI context is exactly the failure that hid for a day.

**D4 — Single-flight background mining refresh.**
`Routines()` always returns `PromptClassifier.BuildRoutines(customPrompts,
cachedMined)` immediately. If the cache is stale and no refresh is in flight,
it starts one `Task.Run(Discover)` (flag under the existing `_routineGate`);
completion swaps the cache + timestamp and logs duration. Consequences we
accept: the first ticks after a cold start classify against custom prompts
with no mined enrichment (logged as such), and two API callers no longer run
two concurrent scans. Alternative — pre-warming the cache synchronously at
StartAsync — rejected: it just moves the dead window, and it delays host start.

**D5 — CLI reader: `ReadLineAsync` until null.**
Replace `while (!reader.EndOfStream) { … ReadLineAsync … }` with
`while ((line = await reader.ReadLineAsync(ct)) is not null)`. Null is the
EOF signal; behavior identical, no blocked thread. (`EndOfStream` on a live
pipe blocks synchronously until a byte or EOF arrives.)

## Risks / Trade-offs

- [Handle forced before `Application.Run`] → WinForms supports pre-Run handle
  creation; messages queue until the loop pumps. Verified by running the app.
- [Early GUI events dropped by D2] → only in the sub-second pre-handle window,
  and only monitoring rows; D1 makes the window practically unreachable.
- [First ticks classify without mined routines] → logged explicitly
  (`mining … in background`, `mining done in N s`), and only affects
  suggestion-kind label enrichment for ~1–2 min after process start; goal/drive
  loops don't depend on mined labels.
- [`ConfigureAwait(false)` changes resume threads] → both services only touch
  their own state + thread-safe stores; nothing in their tick paths requires a
  specific thread (they already ran on threadpool threads when healthy).

## Migration Plan

Pure in-process change; deploy via the standard `swap.ps1` cycle, rollback via
the armed dead-man's switch. Startup race is probabilistic — verification is
(a) the structural argument above, (b) isolated-port run: engine tick + poller
log lines appear within seconds while mining logs run in the background, API
healthy, GUI opens.

## Open Questions

(none)
