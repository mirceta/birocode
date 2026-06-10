# Detached Runs — agent runs survive client disconnects

> **Status (2026-06-10):** Deployed to the live :5099 harness and confirmed
> by the End User. Includes the follow-up seq-watermark fix (per-run seq
> restart silently swallowed every second turn; seq is now monotonic per repo
> across runs and the client watermark resets on send). Browser-verified via
> `.claudeweb-preview/playwright/verify-detached-runs.mjs` (mid-stream reload)
> and `verify-two-turns.mjs` (multi-turn live streaming). Not yet merged to main.

## Problem

A chat turn dies the moment the phone locks or the Chrome tab closes. The run
is hard-wired to the HTTP connection:

- `ChatController.cs:97` passes `HttpContext.RequestAborted` into `RunAsync`.
- On disconnect that token fires and `CliRunnerService.cs:160` kills the CLI
  process tree (deliberate — stop billing on disconnect).
- The frontend's `send()` catch (`ChatContext.jsx:249`) shows the error banner
  and marks the tab `error`; on reload DockContext resets `running → idle`.

The agent must instead be owned by the backend: closing the tab or losing the
connection should not stop processing, and the client should be able to come
back and catch up.

## Glossary

| Term | Definition |
|------|------------|
| **Run** | One CLI chat turn for one repo, executing on the backend. At most one Run per repo (existing `_busyRepos` rule). |
| **Run Session** | The backend object owning a Run: its process, cancellation source, status, and Event Buffer. Kept after the Run ends, until the next Run for that repo starts. |
| **Event Buffer** | The Run Session's ordered list of emitted SSE events, each tagged with a `seq` number, replayable to late clients. |
| **Attachment** | One open SSE connection subscribed to a Run Session. Attachments come and go freely; the Run never depends on one. |
| **Reattach** | A client opening a new Attachment with `after=<seq>`, receiving the buffered events past that point, then live events. |
| **Stop** | Explicit user request to cancel a Run (kills the process tree). The only way a Run dies early — disconnects no longer do. |

## Design

### Backend

**1. `RunSessionService` (new, `Services/Chat/RunSessionService.cs`)**

`ConcurrentDictionary<repoId, RunSession>`. A `RunSession` holds:

- `Status` — `running | done | error`
- `SessionId` — captured from `system/init`
- `Events` — lock-protected `List<string>` of serialized SSE events, each
  wrapped with a `seq` field (capped at ~10k entries; transcript on disk is
  the fallback for anything longer)
- `CancellationTokenSource` — owned by the backend, fired only by Stop or app
  shutdown
- Subscribers — one `Channel<string>` per Attachment; emit appends to the
  buffer and broadcasts to all channels

Replaces the bare `_busyRepos` set as the single-flight gate: `TryBeginRun`
moves here (a repo is busy iff its Run Session has `Status == running`).

**2. `POST /api/chat` (changed)**

Starts the Run on a background `Task.Run` with the Run Session's own token —
**not** `RequestAborted` — then immediately attaches the response as an
Attachment (replay from seq 0 + live). Dropping the connection ends only the
Attachment. `CliRunnerService.RunAsync` itself barely changes: it gets its
`emit` sink and token from the Run Session, and its `finally` marks the Run
Session `done`/`error` instead of just clearing `_busyRepos`. The
"cancelled = client disconnected" wording becomes "stopped by user".

**3. `GET /api/chat/stream?after=N` (new)**

Reattach endpoint (repo from `X-Repo-Id` as usual). Replays buffered events
with `seq > N`, then streams live until the Run ends or the client drops.
Works after the Run finished too — the kept Run Session replays the full turn
(this is how a closed tab recovers the result).

**4. `POST /api/chat/stop` (new)**

Fires the Run Session's cancellation source. Required because a frontend
abort no longer kills anything.

**5. `GET /api/runs` (new)**

`{ [repoId]: { status, sessionId, lastSeq } }` — lets the frontend reconcile
tab status on load and decide whether to Reattach. (This is the
`GET /api/dock/status` idea from `plans/agent-dock.md` §7, now required.)

### Frontend

**6. `ChatContext.jsx`**

- Track `lastSeq` per conversation from incoming events; drop events with
  `seq <= lastSeq` (dedup across Reattaches).
- `send()` unchanged on the happy path. On stream failure where the turn may
  still be alive (network error / abort that wasn't a user Stop), do not set
  the error banner — Reattach with backoff (e.g. 2s, a few attempts) via
  `GET /api/chat/stream?after=lastSeq`; only surface an error if the backend
  reports the Run as `error`.
- `stop()` calls `POST /api/chat/stop`, then aborts the local read.
- On mount and on `visibilitychange` (phone unlock): query `/api/runs`; for
  any tab whose repo is `running`, Reattach.

**7. `DockContext.jsx`**

Stop blind `running → idle` reset on reload; reconcile from `/api/runs`
instead (running stays running, finished becomes done/error).

**8. `client/src/api/client.js`**

Small additions: `apiStream` accepts a GET variant (or a `streamRun(after)`
helper) for the Reattach endpoint.

No new UI surface — this fixes behavior in both Simple and Advanced modes, so
no `UiModeContext` capability entry is needed.

## Implementation phases

1. **Backend detach** — `RunSessionService`, background `Task.Run`, Event
   Buffer + Attachments, `POST /api/chat` rewired, `POST /api/chat/stop`.
   Verify with curl: start a turn, kill the connection, watch the GUI call
   log finish with `Success`.
2. **Reattach** — `GET /api/chat/stream?after=N` with replay + live,
   `GET /api/runs`.
3. **Frontend** — seq tracking/dedup, auto-Reattach on failure +
   visibility/load, Stop wiring, DockContext reconciliation.
4. **Verify in browser** (per `docs/claude-web/browser-testing.md`): start a
   turn with Playwright, kill the page mid-stream, reopen, confirm the
   transcript catches up and the tab shows `done`. Self-dev rules apply
   (`docs/claude-web/self-dev.md`): isolated build dir, never the running
   app's port.

## Files touched

| File | Change |
|------|--------|
| `ClaudeWeb.App/Services/Chat/RunSessionService.cs` | **New.** Run Sessions, Event Buffer, Attachments, single-flight gate |
| `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` | Emit/token come from the Run Session; finalize sets Run status; `_busyRepos` moves out |
| `ClaudeWeb.App/Controllers/ChatController.cs` | Detached `POST /api/chat`; new `stream`, `stop`, `runs` endpoints |
| `ClaudeWeb.App/Services/Chat/ChatModuleExtensions.cs` | Register `RunSessionService` |
| `client/src/context/ChatContext.jsx` | seq tracking, Reattach logic, Stop endpoint, visibility handler |
| `client/src/context/DockContext.jsx` | Reload reconciliation via `/api/runs` |
| `client/src/api/client.js` | GET stream helper |

## Risks & mitigations

- **Orphaned runs billing forever** — a Run nobody watches keeps running.
  Accepted: that is the point of the feature; the GUI call log shows it, and
  Stop exists. The CLI turn is finite anyway (`-p` mode ends by itself).
- **Memory** — Event Buffers held until the next Run. Capped per session;
  one session per repo, few repos.
- **Replay races** — appending to the buffer and broadcasting must be atomic
  per event (single lock) so a Reattach never misses or duplicates a seq.
- **App shutdown** — dispose Run Sessions (cancel + kill tree) on Kestrel
  shutdown so no CLI processes leak.
