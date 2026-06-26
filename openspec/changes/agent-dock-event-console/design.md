## Context

The harness already owns several background operations per repository (discovery
job, app launch, port check; later autopilot/loops). They share two traits: they
are keyed **per repo**, and they have a clear **invoke → await → result**
boundary that our own code controls. We want a dock-visible log of that boundary.

Two existing primitives are directly reusable:

- **`RunSessionService` buffer** (`Services/Chat/RunSessionService.cs`): a
  monotonic `seq` per event, a soft cap with oldest-trim on overflow, and a
  `StreamAsync(after)` that replays everything past a watermark. This is exactly
  an event-log shape.
- **The `?after=N` reattach contract**: chat (`GET /api/chat/stream?after=N`) and
  discovery status both let the dock rejoin by watermark. The dock already polls
  discovery status every ~5s.

We reuse the *shape* (seq + watermark + cap) but not the full machinery: the
console's first slice does not need a live `Channel<>` push — append-only +
poll-by-watermark is enough.

## Goals / Non-Goals

**Goals**
- A per-repo, in-memory, append-only event ring with monotonic seq and a cap.
- Boundary-level events for the three discovery-feature operations
  (discovery, run, check), each with a `started` and a terminal (`done`/`error`).
- A poll endpoint that returns events after a watermark + the current high-water.
- A Console lane in the dock, per repo, polling at the existing dock cadence.
- A source-agnostic event model so other harness operations can emit later.

**Non-Goals**
- No agent-gateway internals (tool calls, tokens, steps). Boundary only.
- No SSE in slice 1. No disk persistence. No per-tab scoping.
- No behavioural change to discovery/run/check — instrumentation only.

## Decisions

### D1 — Per-repo scoping, not per-dock-tab
Background jobs are already keyed per repo (`LocalAppDiscoveryJobs` is per-repo
single-flight; run/check act on a repo's ports). Two dock tabs on the same repo
are looking at the *same* backend activity, so the console is keyed by `repoId`.
The lane lives in the dock tab but reads a repo-scoped feed. This matches the
data and avoids inventing tab-attribution plumbing the backend doesn't have.

### D2 — In-memory ring, append-only, capped
A `ConcurrentDictionary<repoId, RepoLog>` where each `RepoLog` holds a
`List<EventRecord>` under a lock, a monotonic `_seq`, and a soft cap (~500
events) that trims the oldest chunk on overflow — same discipline as
`RunSession` (10k) and the intercept feed (50). The log is **ephemeral**: lost on
restart, which is acceptable for a "what's happening now" console. Seq is
monotonic per repo for the process lifetime.

### D3 — Event model (small, source-agnostic)
```
EventRecord {
  int    Seq        // monotonic per repo
  long   At         // epoch ms
  string Op         // "discovery" | "run" | "check"  (open string; new sources add their own)
  string Phase      // "started" | "done" | "error"
  string Title      // short human label, e.g. "Discovery", "Run minesweeper"
  string Detail     // boundary narration, e.g. "waiting for the agent gateway…",
                     //   "returned 3 apps — rendered to the dock", "port 5200 live"
}
```
`Op` and `Phase` are plain strings (not enums) so a future source — autopilot,
loops — can emit without touching the model. The frontend renders generically
off these fields; it does not switch on a closed set.

### D4 — Emit at the boundary our code owns
- **Discovery**: emit `started` in `LocalAppDiscoveryJobs.StartNew` (right before
  the gateway call), and the terminal in `MarkDone`/`MarkError` (`done` carries
  the app count; the "rendered to the dock" framing is the *harness* side of the
  result, which is the truthful boundary — the backend produced the apps the dock
  renders). Joining an already-running job does **not** re-emit `started`.
- **Run**: emit `started`/`done` around `LocalAppRunner.Launch` at its caller
  (`LocalAppsController` run endpoint). "launch issued" — we spawn detached and
  do not retain the PID, so we cannot truthfully claim "running"; the event says
  what we actually did.
- **Check**: emit `started`/`done` around the `IsListening` probe, `done` detail
  reflecting live / not-listening.

Emission is best-effort and must never throw into the operation it instruments
(wrap in try/catch or keep the emit pure).

### D5 — Transport: poll by watermark
`GET /api/repos/{repoId}/events?after=N` → `{ events: [...], lastSeq }`. The dock
holds a per-repo watermark, polls at the existing ~5s cadence while the Console
lane is mounted, and advances the watermark by `lastSeq`. `after=-1` (or absent)
returns the full retained ring. This is the discovery-status pattern, reused.
SSE is a later upgrade if 5s feels laggy; the event model and watermark contract
are transport-agnostic so the upgrade is additive.

### D6 — Console lane placement & mode
A fourth `phone__lane` button in `PinnedAgent.jsx` beside Builder / Ask / Files,
gated by a capability key defaulting to **Advanced** (per UI-modes convention).
Rendered in the `phone__screen` switch alongside Chat / Files / ProductFrame as a
small `EventConsole` component. Newest event at the bottom (terminal-log feel),
auto-scroll on append.

### D7 — No gate
These are ordinary harness operations (not autopilot's operator-gated
auto-driving), so the events endpoint is not behind the autopilot gate. It sits
behind the normal session auth like every other `/api` route.

## Risks / Trade-offs

- **Ephemeral log** — a restart drops history. Acceptable for "happening now";
  if users want history we add persistence later (out of scope).
- **Polling latency** — up to ~5s to see an event. Fine for human-watched
  lifecycle; SSE is the escape hatch.
- **"rendered to the dock" wording** — the backend emits the result; the dock
  renders it. We word the detail as the harness-side fact ("returned N apps")
  rather than asserting a UI action the backend can't observe, to stay honest.
- **Emit coupling** — instrumenting three call sites risks drift if a new op
  forgets to emit. Mitigated by keeping emit a one-liner against a shared service
  and documenting the convention in the Understanding app.

## Open Questions

- Should `run`/`check` events be per-(repo, port) titled so concurrent app
  actions read clearly, or is a flat per-repo stream enough? (Leaning: include
  port/app in `Title`, keep the stream flat.)
- Cap size: 500 events per repo a reasonable default, or smaller? (Leaning 500.)
- Do we want a tiny unread-count badge on the Console lane button when new
  events arrive while another lane is focused? (Nice-to-have; defer unless asked.)
