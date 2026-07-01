## Context

The `harness-event-feed` pilot gives each harness a read-only producer feed:
`HarnessEventFeed` (in-memory, bounded, monotonic `seq`, typed envelope `{ seq, at, type,
source, data }`) published over `GET /api/events?after=N`, plus an in-repo `events-app`
that polls it **client-side**. Two limits motivate this change: (1) the "started +
watermark" state lives in the browser, so a reload stops the feed; (2) it can only watch
its own harness.

This change adds a backend **collector**: the harness aggregates events from a set of
**sources** (its own feed plus any number of remote harnesses entered by address),
pulling each source server-side on a background loop, and serves one merged, source-tagged
stream. The `events-app` becomes a thin observer/controller of that backend state. The
collector is **read-only toward every observed harness** (it only `GET`s their
`/api/events`); the only writes are to its own source list.

Operator decisions taken into this design: **(1)** remote credentials are **encrypted at
rest**; **(2)** **any** operator-entered address is allowed (no allowlist); **(3)** this
harness is **itself a source**, read in-process and active by default; **(4)** the source
list **persists** across restart (events stay in-memory).

## Goals / Non-Goals

**Goals**
- Backend-owned listening: a `CollectorService` + background poller owns sources,
  per-source watermarks, and the aggregated buffer — independent of any open browser, so a
  frontend reload simply resumes.
- Multi-harness: register a harness by address (+ credential), pull its `/api/events`
  server-side, merge into one source-tagged stream readable by a single watermark.
- The `events-app` becomes a pure observer/controller (render state; start/stop/add a
  source); no client-owned "started" flag.

**Non-Goals**
- No push transport (WebSocket/SSE) — watermark polling stays the transport.
- No **reacting** to events — observe/aggregate only.
- No new event types beyond `turn.ended`.
- No action exposed/caused on a watched harness — strictly `GET` toward sources.
- No surfacing in the main React UI — the `events-app` on the Local tab stays its home.

## Decisions

### 1. `CollectorService` = singleton state + a hosted background poller

A single `CollectorService` (registered `AddSingleton` + `AddHostedService` wrapper) owns:
- **Sources**: `{ Id, Label, Address, Kind (self|remote), Active }` plus runtime
  `{ Status, LastError, LastPolledAtMs, SourceWatermark }`. The credential is held
  **separately** as an encrypted blob, never on the DTO returned to clients.
- **Aggregated buffer**: a bounded ring of collector events, each
  `{ seq, at, type, source, sourceId, sourceLabel, data }`, where `seq` is a
  **collector-assigned** monotonic number across *all* sources so the observer pages the
  whole fleet with one watermark. The producer's original envelope (`type`, `source`,
  `at`, `data`) is preserved; `sourceId`/`sourceLabel` identify which registered source it
  arrived through.

**Poller loop** (every ~2.5s, one pass over active sources, best-effort, never throws into
the host):
- **self** → read the in-process `HarnessEventFeed.Read(sourceWatermark)` directly (no
  HTTP, "surely accessible").
- **remote** → `HttpClient` `GET {address}/api/events?after={sourceWatermark}` with the
  decrypted credential as the `X-Auth-Password` header; parse `{ events, lastSeq }`.
- For each returned event: append to the buffer with a fresh collector `seq`, tagged with
  the source; then advance that source's watermark to `lastSeq`. Update `Status`
  (`active` on success, `error` + reason on failure — keep last good, simple backoff).

### 2. Persistence + credential at rest

- The **source list** persists to `%APPDATA%\ClaudeWeb\collector-sources.json` (same store
  dir as `repositories.json`), so listening **auto-resumes on restart**. The **aggregated
  events do not persist** (in-memory ring, consistent with the feed). On boot the poller
  re-seeds watermarks to "full" and refills.
- The **credential is encrypted at rest** with ASP.NET Core **Data Protection**
  (`IDataProtector`, purpose `"collector.source.credential"`), whose keys are themselves
  DPAPI-protected on Windows. The JSON stores only the protected (base64) blob. Plaintext
  exists only transiently in memory when setting the outbound header; it is **never**
  logged, echoed in a response, or written in the clear. Any error text from a remote pull
  is scrubbed of the credential before logging.

### 3. Self is a built-in, non-removable source

On first run the collector seeds one `kind:self` source (label e.g. the machine/harness
name, `Active=true`, non-removable — analogous to `RepositoryConfig.IsSelf`). It needs no
credential and is read in-process. This makes the local feed always-collected, so the
original "press start once / reload resumes" need falls out for free: the local stream is
simply always present in the aggregate.

### 4. REST surface (`CollectorController`, under `/api`, existing auth)

- `GET /api/collector/sources` → `[{ id, label, address, kind, active, status, lastSeq,
  lastError, lastPolledAt }]` — **never** the credential.
- `POST /api/collector/sources` `{ address, label?, credential? }` → register a
  `kind:remote` source (Active=true), persist, start polling; returns the created source
  (no credential). `address` is normalized (scheme defaulted, trailing slash trimmed).
- `POST /api/collector/sources/{id}/start` · `/stop` → toggle `Active`, persist.
- `DELETE /api/collector/sources/{id}` → stop + remove + persist (rejects the self source).
- `GET /api/collector/events?after=N` → `{ events: [...], lastSeq }`, watermark-paged
  exactly like `/api/events`.

These are writes to the collector's **own** subscription state (the same category as
registering a repo) — no action is exposed or caused on any watched harness. The existing
`GET /api/events` producer endpoint is unchanged.

### 5. `events-app` becomes the observer/controller

Rework the static app from a client-side poller into a backend observer:
- On load: `GET /api/collector/sources` + `GET /api/collector/events?after=watermark`
  (start `-1` for the full retained buffer, then advance). Render a **sources panel**
  (label, address, `kind`, status dot, start/stop, remove) and the **merged event stream**
  (still rendered generically from the envelope, now also showing the source label/badge).
- An **"Add harness"** form (`address`, optional `label`, optional `credential`) POSTs a
  new source. No client-owned "started" flag — the backend is the source of truth, so a
  reload just re-reads state and continues.
- Still build-less, self-contained, served via the existing `kind:harness` local-app
  mechanism (`EventsApp`/`EventsAppId`), relative URLs per `docs/local-exposure-convention.md`.

## Risks / Trade-offs

- **Outbound to arbitrary addresses (SSRF-shaped)** — accepted per decision (operator-only,
  behind auth, no allowlist). Mitigate blast radius: a short connect/read timeout, the
  collector only ever `GET`s `/api/events`, and failures are isolated per source (one bad
  source never stalls the others or the host).
- **Credential at rest** — encrypted via Data Protection; the dominant residual risk is a
  leak through logs/responses, closed by scrub + never-serialize + write-only entry (same
  discipline as the gh-token control).
- **Merged ordering** — collector-assigned `seq` orders by *arrival at the collector*, not
  by source wall-clock; acceptable for an activity feed and keeps a single watermark. The
  stable identity of an event is `(sourceId, producerSeq)`; the collector `seq` is the
  paging cursor.
- **Self via in-process vs HTTP** — reading `HarnessEventFeed` directly avoids a loopback
  round-trip and an auth credential for ourselves; the small cost is a `self` code path
  distinct from `remote`.
- **Watermark reset on restart** — events are in-memory, so after a restart each source
  refills from "full"; brief duplication of still-retained events is possible across a
  restart but harmless for an observe-only feed.

## Migration Plan

Additive on the backend: new service + controller + JSON store; `GET /api/events` and the
producer are untouched. The `events-app` is reworked in place (its old client-poll behavior
is superseded by reading the collector). No data migration. Verify on the live harness:
self events appear in the aggregate without pressing start; a reload of the app resumes the
stream; registering a second harness by address streams its events tagged by source; a
stopped source halts; the credential never appears in any `/api/collector/*` response.
Rollback is a straight revert; deleting `collector-sources.json` resets the source list.

## Open Questions (resolve during apply)

- **Editing a source's credential/label** — for v1, change = `DELETE` + re-add; a `PUT`
  can come later if it's annoying.
- **Poll interval / retention cap** — pick concrete values during apply (≈2.5s poll, reuse
  the feed's retention cap for the aggregate).
- **Source label for self** — machine name vs "this harness"; settle against what's already
  available cheaply.
- **`http` vs `https` / self-signed LAN certs** — default to honoring the entered scheme;
  decide whether to accept self-signed for LAN `https` during apply.
