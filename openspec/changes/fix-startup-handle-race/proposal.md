# fix-startup-handle-race

## Why

A startup race in the harness host can create WinForms control handles on a
threadpool thread: `MainForm.SafeInvoke` trusts `InvokeRequired`, which is
`false` before the form's handle exists, so a background event that fires while
Kestrel is already serving a hot client runs UI code on the wrong thread. The
fallout (diagnosed on live 2026-07-28 with stack/heap dumps): the desktop GUI
deadlocks forever in `SetParent`, and a phantom `WindowsFormsSynchronizationContext`
installed on that thread silently freezes every `BackgroundService`
(autopilot engine, collector poller) at its first `await` — the API stays
healthy, so armed loops just "never tick" with no error anywhere.

Two adjacent liveness defects surfaced by the same investigation: the engine's
first tick mines all transcripts inline (~50 s warm / ~2 min cold), so a loop
armed during that window looks dead; and `CliRunnerService` parks a threadpool
thread in a synchronous `EndOfStream` pipe read per active CLI run.

## What Changes

- `Program.Main` constructs `MainForm` and forces its window handle on the main
  (STA) thread **before** `api.Start()` — no background event can ever be first
  to create a handle.
- `MainForm.SafeInvoke` refuses to touch controls before `IsHandleCreated`
  (drops the event) — defense in depth if any pre-handle path remains.
- Every `BackgroundService` (`AutopilotService`, `CollectorPoller`) awaits with
  `ConfigureAwait(false)` so an ambient UI synchronization context can never
  capture their continuations.
- Transcript mining moves off the tick path: `Routines()` returns the cached
  result immediately and refreshes via a single-flight background task. First
  ticks run on custom prompts alone until the first mining pass lands (logged),
  instead of blocking the engine and every concurrent API caller.
- `CliRunnerService` reads CLI stdout with async read-until-null instead of the
  blocking `EndOfStream` loop.

## Capabilities

### New Capabilities
- `host-runtime`: startup ordering and thread-affinity guarantees of the
  harness host process — UI handles are created only on the UI thread, hosted
  background services stay live regardless of GUI state, and the loop engine's
  tick path never blocks on transcript mining.

### Modified Capabilities

(none — chat/loop spec-level behavior is unchanged; these are liveness and
threading guarantees of the host itself)

## Impact

- `ClaudeWeb.App/Program.cs` — startup order (form + handle before API start).
- `ClaudeWeb.App/UI/MainForm.cs` — `SafeInvoke` handle guard.
- `ClaudeWeb.App/Services/Autopilot/AutopilotService.cs` — `ConfigureAwait(false)`,
  background single-flight mining refresh.
- `ClaudeWeb.App/Services/Events/CollectorPoller.cs` — `ConfigureAwait(false)`.
- `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` — async stdout loop.
- No API surface, config, or frontend changes.
