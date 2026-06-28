# Expose harness events read-only over REST, starting with "agent turn ended"

## Why

The end goal (a **future** task) is a separate **service + app on another computer**
that **collects events from many harnesses** and **reacts** to them. Before any of
that, we want a **pilot / proof-of-concept** on one harness that proves the first,
load-bearing link works: a harness can **publish what is happening inside it** so an
outside reader can observe it.

The first event we care about is **an agent's turn ending** — the moment the harness
knows a chat run it launched has finished (success or error). The harness already
detects this exact moment (`CliRunnerService.HandleResult` emits the SSE `done`/`error`
for a run) but it is only delivered to the open chat stream; nothing publishes it as an
observable harness event for an external reader.

There is already a proven **per-repo** event mechanism — `RepoEventLog` +
`GET /api/repos/{repoId}/events?after=N` + the dock's Event Console
(`agent-dock-event-console` spec). It is the right *pattern* (in-memory ring buffer,
monotonic `seq`, watermark polling) but the wrong *shape* for this goal: it is scoped
to a single repo and its spec deliberately **excludes agent/turn lifecycle** ("Gateway
internals are not logged"). A cross-harness collector wants **one stream per harness**,
not one per repo, and it specifically wants the turn-ended boundary.

So this change adds a **harness-level event feed**: a general, extensible, read-only
mechanism for publishing harness events, seeded with exactly one event type
(`turn.ended`), plus a **local test app in this repo** that consumes the feed and proves
the events arrive. The feed is designed so **new event types are added later** without
changing its shape — the pilot is the seed of the general mechanism, and the test app
is the seed of the future collector.

## What Changes

- **New read-only harness event feed.** Add a `HarnessEventFeed` service (a
  harness-scoped sibling of the per-repo `RepoEventLog`): an in-memory, bounded,
  monotonic-`seq` log of typed harness events, readable by watermark. Each event carries
  a stable **typed envelope** — `seq`, `at` (epoch ms), `type` (e.g. `turn.ended`),
  `source` (which harness / repo the event came from), and a `data` payload object whose
  shape depends on `type`. The envelope is the general mechanism; `type` is the
  extension point.
- **Seed it with one event type: `turn.ended`.** When an agent's turn ends, the harness
  publishes a `turn.ended` event whose payload identifies the repo and session and
  reports the terminal status (done vs error) and any cheap, already-known summary (e.g.
  cost / turn count the harness already has at that point). This reuses the existing
  turn-end detection point; it does not add new agent instrumentation.
- **One read-only REST endpoint.** Expose `GET /api/events?after=N` returning
  `{ events: [...], lastSeq }`, watermark-paged exactly like the per-repo endpoint. It is
  **strictly read-only** — a `GET` with no side effects. Per the user's explicit
  constraint, this change introduces **no new action endpoint** and exposes **no
  mutation over REST that is not already reachable from the frontend**. The feed only
  *reports* events; it never *causes* harness actions.
- **A local test app in this repo (the pilot consumer).** Add a build-less,
  self-contained static app (folder at the repo root, served via the existing
  `kind:harness` local-app mechanism on the Local tab) that polls `GET /api/events`,
  advances its watermark, and renders the live event stream. It is written **generically
  against the envelope** — it lists whatever `type`s arrive (not hardcoded to
  `turn.ended`) so it doubles as the test bed for future event types. It is the
  in-repo stand-in for the future external collector.
- **Authentication is unchanged and inherited.** The feed lives under `/api/*`, so it is
  protected by the existing `PasswordAuthMiddleware` (session cookie or
  `X-Auth-Password`). No new auth surface is added. (How a *remote* collector on another
  machine authenticates to many harnesses is **out of scope** here — see below.)

## Impact

- **Affected specs:**
  - `harness-event-feed` — **new capability, seeded by this change** (the general
    read-only event mechanism + the `turn.ended` event + the pilot consumer app).
- **Relationship to `agent-dock-event-console` (existing per-repo log):** unchanged.
  That per-repo log and its `/api/repos/{repoId}/events` endpoint and Console lane keep
  working as-is. This change adds a *separate, harness-scoped* feed rather than widening
  the per-repo one, because (a) the collector wants one stream per harness and (b) the
  per-repo spec explicitly excludes turn lifecycle. The shared *pattern* (ring buffer,
  `seq`, watermark) is reused deliberately; whether to physically share code is a
  design-phase decision.
- **Affected code (backend):**
  - New `Services/Events/HarnessEventFeed.cs` (+ a module-extension `AddSingleton`,
    wired in `EmbeddedApi.cs` alongside `AddEventsModule()`).
  - New `Controllers/HarnessEventsController.cs` — `GET /api/events?after=N`.
  - `Services/Chat/CliRunnerService.cs` — at the existing turn-end point
    (`HandleResult`, the `done`/`error` path), publish a `turn.ended` event to the feed.
    Inject the feed; emit best-effort so it can never disrupt a run.
- **Affected code (frontend):** none required for the pilot — the test app is a static
  folder served through the existing local-app proxy. (Surfacing the feed inside the
  React UI is **out of scope**; the Local tab already exists to host the test app.)
- **Local app registration:** the test app is served as a synthetic `kind:harness`
  app (like the always-on Understanding/Lab apps) or registered as a repo local app —
  settled in design. Relative-URL / dual-stack local-exposure rules
  (`docs/local-exposure-convention.md`) apply.
- **Out of scope (explicitly future):**
  - The remote **collector service + app** on another machine, and how it discovers /
    authenticates to multiple harnesses (the feed being behind password auth means a
    remote reader needs a credential — a real design question, deferred).
  - Persisting events across a harness restart (in-memory ring buffer is enough for a
    pilot, matching `RepoEventLog`).
  - A live **push** transport (WebSocket/SSE) for the feed — polling by watermark is the
    pilot transport; push can be added later behind the same envelope.
  - Any **new event types** beyond `turn.ended` (the mechanism is built to grow; only
    one type is seeded now).
  - Any new **action / mutation** endpoint — none is added, by constraint.
