## 1. Backend: collector state + aggregated buffer

- [ ] 1.1 Add `Services/Events/CollectorService.cs` (singleton): source list + per-source runtime state (status, lastError, lastPolledAt, watermark) + a bounded aggregated ring buffer of `{ seq, at, type, source, sourceId, sourceLabel, data }` with a collector-assigned monotonic `seq` across all sources; thread-safe append + watermark `Read(after)`
- [ ] 1.2 Seed a non-removable `self` source on first run (active by default), read in-process from `HarnessEventFeed`
- [ ] 1.3 Reuse the feed's retention cap; pick a poll interval (~2.5s)

## 2. Backend: persistence + credential at rest

- [ ] 2.1 Persist the source list to `%APPDATA%\ClaudeWeb\collector-sources.json` (same dir as `repositories.json`); load on startup so listening auto-resumes
- [ ] 2.2 Encrypt each remote credential at rest via ASP.NET Core Data Protection (`IDataProtector`, purpose `collector.source.credential`); store only the protected blob, never plaintext; decrypt in-memory only when setting the outbound header
- [ ] 2.3 Never serialize the credential into any DTO; scrub it from any error text before logging

## 3. Backend: background poller

- [ ] 3.1 Add a hosted background loop (one pass over active sources every interval, best-effort, never throws into the host)
- [ ] 3.2 `self` → `HarnessEventFeed.Read(watermark)` in-process; `remote` → `HttpClient` `GET {address}/api/events?after={watermark}` with `X-Auth-Password` from the decrypted credential, short connect/read timeout
- [ ] 3.3 Append new events to the aggregate (fresh collector `seq`, tagged with source), advance the source watermark to the response `lastSeq`, update status (`active` / `error`+reason, keep last good, simple backoff); isolate failures per source

## 4. Backend: REST surface

- [ ] 4.1 `Controllers/CollectorController.cs`: `GET /api/collector/sources` (no credential), `POST /api/collector/sources {address,label?,credential?}` (register remote, active, normalize address — default scheme, trim trailing slash), `POST /api/collector/sources/{id}/start|stop`, `DELETE /api/collector/sources/{id}` (reject self), `GET /api/collector/events?after=N`
- [ ] 4.2 Register the service + hosted loop in DI (extend `AddEventsModule` / `EmbeddedApi.cs`); leave `GET /api/events` and the producer unchanged

## 5. Frontend: events-app becomes observer/controller

- [ ] 5.1 Rework `events-app/` from a client-side poller into a backend observer: on load read `GET /api/collector/sources` + `GET /api/collector/events?after=watermark`, advance the watermark, render the merged stream generically from the envelope with a source badge; reload resumes (no client-owned "started" flag)
- [ ] 5.2 Sources panel: list (label, address, kind, status dot, lastError), start/stop, remove; an "Add harness" form (`address`, optional `label`, optional **write-only** `credential`) POSTing a new source
- [ ] 5.3 Keep it build-less/self-contained, served via the existing `kind:harness` mechanism, relative URLs per `docs/local-exposure-convention.md`

## 6. Understanding app + docs

- [ ] 6.1 Refresh the Understanding app for the collector model (sources → background poller → aggregated feed; self vs remote; observer frontend) per the convention
- [ ] 6.2 No convention/doc edits expected (no `plan.md` — frozen)

## 7. Verify

- [ ] 7.1 Build frontend + .NET clean
- [ ] 7.2 Backend behavior: self events appear in the aggregate with no start; a stopped source halts and a started one resumes; an unreachable/unauthorized remote shows an error status without stalling others; source list persists across a restart; **the credential never appears in any `/api/collector/*` response and is encrypted in the JSON store** (grep the diff + inspect the file)
- [ ] 7.3 Frontend (live or isolated preview): app shows the live aggregate, a reload resumes without re-starting, adding a second harness by address streams its events tagged by source
- [ ] 7.4 `openspec validate add-event-feed-collector --strict` — by inspection until the CLI is installed (per the openspec-cli-absent memory)
