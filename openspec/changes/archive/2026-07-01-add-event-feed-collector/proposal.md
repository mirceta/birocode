# Turn the event-feed pilot into a backend-owned, multi-harness collector

## Why

The `harness-event-feed` pilot proved the first link: a harness publishes its events
(seeded with `turn.ended`) read-only over `GET /api/events`, and the in-repo
`events-app` consumes them. Its proposal **explicitly deferred** the real goal — a
**collector that aggregates events from many harnesses** — and shipped the consumer as
a **client-side poller**. Two concrete gaps now block making it useful, and they are
exactly the two things this change fixes:

1. **The listening state lives in the browser, so it's fragile.** The `events-app`
   holds the "started / not started" flag and the polling watermark in client JS. So a
   **page reload stops the feed** and you must press start again; two tabs each poll
   independently; nothing is listening when no tab is open. The real answer — "what am
   I listening to, and how far have I read" — should be **backend state**. The frontend
   should be a thin **observer**: press start *once*, the backend begins and keeps
   going; reload and it just **resumes showing the live feed** because the backend never
   stopped.

2. **The collector can only watch its own harness.** To be the thing the original
   proposal pointed at, it must aggregate **multiple harnesses**: you **enter the
   address of a harness**, the collector starts pulling that harness's `/api/events`,
   and its events flow into one merged stream — so one screen watches a fleet.

## What Changes

This change introduces a backend **collector**: the harness can act as an aggregator
that owns a set of **event sources**, actively pulls each source's read-only feed
server-side, and serves the merged result. The `events-app` becomes a pure
observer/controller of that backend state.

### 1. Backend-owned listening (state moves off the frontend)

- Add a **collector** in the backend that owns the registered **sources** and runs a
  **background poller per active source** — independent of any open browser. Pulling
  happens on the server; the feed accumulates whether or not a tab is open.
- **"Start" becomes a backend action.** Activating a source tells the backend to begin
  (and keep) pulling it. The state survives **frontend reloads**, multiple tabs, and —
  because the source registry is **persisted** — a **harness restart** (listening
  resumes on boot). Events themselves stay in a bounded in-memory ring (consistent with
  the existing feed; not required to survive restart).
- The **`events-app` becomes an observer**: on load it reads the collector's current
  state (sources + statuses + merged events from its watermark) and renders it,
  resuming the live feed with no "press start again." Its only writes are
  register/start/stop a source.

### 2. Register and listen to multiple harnesses

- Add a **source registry**: enter a harness **base address** (and a display label),
  and the collector registers it and begins pulling its `GET /api/events`, **merging**
  events into one aggregated, **source-tagged** stream.
- Each source carries a **status** (active / connecting / erroring with a reason /
  stopped), its **own watermark**, and a label, so the observer can show a fleet at a
  glance and surface a source that has gone unreachable.
- **Auth to a remote harness:** a remote `/api/events` is behind the same
  `PasswordAuthMiddleware` (session cookie or `X-Auth-Password`). So registering a
  remote source takes a **credential**, handled as a **secret** — supplied write-only,
  used only to authenticate the collector's outbound pulls, **never echoed back or
  logged** (the same discipline as the GitHub-token control in
  `add-git-identity-surface`).

### New backend surface (shape settled in design)

- A `CollectorService` (hosted background service) holding sources + per-source pollers
  + an aggregated, collector-sequenced feed; a small **persisted source registry**
  (JSON under `%APPDATA%\ClaudeWeb`, like `repositories.json`) for everything **except**
  the secret credential's plaintext.
- REST. The collector stays **read-only toward every observed harness** — it only ever
  `GET`s their `/api/events`, never causing or exposing any harness action (the pilot's
  no-remote-control rule is fully honored). The only server-side writes are to the
  collector's **own subscription config** — which addresses it listens to — the same
  benign category as registering a repo in the harness today, and likewise already
  reachable from the frontend. Nothing on a watched harness is mutated:
  - `GET /api/collector/sources` → `[{ id, label, address, active, status, lastSeq, lastError }]`
  - `POST /api/collector/sources` `{ address, label?, credential? }` → register + start
  - `POST /api/collector/sources/{id}/start` · `/stop` → toggle active
  - `DELETE /api/collector/sources/{id}` → stop + remove
  - `GET /api/collector/events?after=N` → merged `{ events: [{ seq, at, type, source, sourceId, data }], lastSeq }`, watermark-paged exactly like `/api/events`, with a collector-assigned monotonic `seq` across all sources.
- The existing `GET /api/events` (the local single-harness producer feed) is
  **unchanged** — it is precisely what each registered source, including this harness
  itself, exposes for a collector to pull.

### Frontend (`events-app`) changes

- Becomes a backend observer: on load, `GET /api/collector/sources` +
  `GET /api/collector/events?after=watermark`; render a **sources panel** (address,
  status, start/stop, remove) and the **merged event stream** (still rendered
  generically from the envelope, now also showing which source each event came from).
  An **"Add harness"** form registers a new source. No client-owned "started" flag — the
  backend is the single source of truth.

## Capabilities

### New Capabilities
- `event-feed-collector`: a backend-owned aggregation layer that registers multiple
  harness event sources by address (+ credential), actively pulls each source's
  read-only feed server-side (surviving frontend reloads and harness restarts), and
  exposes the merged, source-tagged stream plus source-management endpoints; the in-repo
  app is a thin observer/controller of this state.

### Modified Capabilities
- `harness-event-feed`: the **in-repo consumer app** requirement changes — the app is no
  longer a client-side poller of the local feed but an **observer of the collector's**
  backend-owned, multi-source state. The per-harness producer (`turn.ended`, the typed
  envelope, `GET /api/events`, auth) is **unchanged** and is what every source exposes.

## Impact

- **Backend (`ClaudeWeb.App`)**: new `Services/Events/CollectorService.cs` (hosted
  background poller + source store) and `Controllers/CollectorController.cs`; reuse the
  envelope/ring-buffer pattern from `HarnessEventFeed`/`RepoEventLog`. An outbound HTTP
  client to pull remote `/api/events`. A persisted source registry (JSON), with the
  per-source **credential kept out of plaintext** (DPAPI/secret store — design).
- **Frontend (`events-app/`)**: rework from client-poller to backend observer +
  source-management UI. Still build-less, self-contained, served via the existing
  `kind:harness` local-app mechanism (relative URLs / dual-stack per
  `docs/local-exposure-convention.md`).
- **Security surface to address in design**: (a) the collector makes **outbound
  requests to operator-supplied addresses** (an SSRF-shaped surface — it is operator-
  gated behind auth, but note loopback/internal-range handling); (b) **storing remote
  credentials at rest** (never logged/echoed; encrypted or out-of-band, not plaintext
  in the JSON store); (c) the source-management endpoints write only the collector's
  **own subscription list** (like registering a repo) and never cause or proxy any
  action on a watched harness.
- **Out of scope (this change)**: a live **push** transport (WebSocket/SSE) — polling by
  watermark stays the transport; **reacting** to events (the future collector "reacts"
  goal) — this change only *observes* and *aggregates*; new **event types** beyond
  `turn.ended`; surfacing the collector inside the main React UI (the `events-app` on the
  Local tab remains its home).

## Open Questions (resolve in design)

- **Self as a source**: poll our own `/api/events` over loopback for uniformity, or read
  the in-process `HarnessEventFeed` directly and special-case "self"?
- **Merge & identity**: collector-assigned global `seq` vs preserving each source's
  `seq`; how to **dedup**/order across sources; whether `(sourceId, sourceSeq)` is the
  stable key.
- **Credential at rest**: DPAPI-encrypted in the JSON store vs a separate secret store;
  what a remote actually accepts (`X-Auth-Password` header) and whether a token model is
  better than the shared password.
- **Address safety**: any allowlist / private-range policy for entered addresses, and
  how `http` vs `https` and self-signed certs are handled for LAN harnesses.
- **Start granularity**: per-source start/stop only, or also a global collector pause;
  what "active" defaults to on registration and after a restart.
