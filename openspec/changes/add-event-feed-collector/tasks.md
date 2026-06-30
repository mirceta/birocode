## 1. Backend: collector state + aggregated buffer

- [x] 1.1 `Services/Events/CollectorService.cs` (singleton): source list + per-source runtime state (status, lastError, lastPolledAt, watermark) + bounded aggregated ring with a collector-assigned monotonic `seq`; thread-safe append + `ReadEvents(after)`
- [x] 1.2 Seed a non-removable `self` source on first run (active by default), read in-process from `HarnessEventFeed`
- [x] 1.3 Reuse the feed's cap (1000/200 trim); poll interval ~2.5s

## 2. Backend: persistence + credential at rest

- [x] 2.1 Persist the source list to `%APPDATA%\ClaudeWeb\collector-sources.json`; load on startup so listening auto-resumes
- [x] 2.2 Encrypt each remote credential via Data Protection (`IDataProtector`, purpose `collector.source.credential`); store only the protected blob; decrypt in-memory only to set the `X-Auth-Password` header
- [x] 2.3 Never serialize the credential into any DTO (`SourceView` has no credential field); scrub it from error text before logging

## 3. Backend: background poller

- [x] 3.1 `CollectorPoller` (`BackgroundService`, ~2.5s), best-effort, never throws into the host
- [x] 3.2 `self` → `HarnessEventFeed.Read(watermark)` in-process; `remote` → `HttpClient GET {address}/api/events?after={watermark}` with the decrypted credential, 6s timeout
- [x] 3.3 Append new events (fresh collector `seq`, tagged with source), advance the source watermark, set status (`active`/`error`+reason), isolate failures per source

## 4. Backend: REST surface

- [x] 4.1 `Controllers/CollectorController.cs`: `GET/POST /api/collector/sources`, `POST .../{id}/start|stop`, `DELETE .../{id}` (rejects self), `GET /api/collector/events?after=N`; address normalized
- [x] 4.2 Registered in `AddEventsModule` (DataProtection + singleton + hosted poller); `GET /api/events` and the producer untouched

## 5. Frontend: events-app becomes observer/controller

- [x] 5.1 Reworked `events-app/` into a backend observer: reads `/api/collector/sources` + `/api/collector/events?after=watermark`, renders the merged stream generically with a source badge; reload resumes (no client-owned start flag)
- [x] 5.2 Sources panel (label, address, kind, status dot, lastError), start/stop, remove; "Add harness" form with a **write-only** credential
- [x] 5.3 Build-less/self-contained, served via the existing `kind:harness` mechanism, API base derived from the app's own URL

## 6. Understanding app + docs

- [x] 6.1 Understanding app rebuilt for the collector model (5 interactive tabs: problem, model+poll animation, reload sim, add-harness sim, guarantees)
- [x] 6.2 No convention/doc edits (no `plan.md` — frozen)

## 7. Verify

- [x] 7.1 .NET build clean (only the 4 pre-existing `CliRunnerService` warnings); client/ unaffected (events-app is static)
- [x] 7.2 Security: `SourceView` has no credential; credential only `Protect`(add) / `Unprotect`(header + scrub); never logged/serialized — confirmed by grep. Self-seed, persistence, and per-source isolation verified by code review
- [~] 7.3 Live: deployed; `[COLLECTOR] poller started` in the harness log; `/api/collector/*` present (auth-gated). **Operator to confirm in the events-app**: self `turn.ended` events appear after a turn, a reload resumes, adding a second harness streams its events tagged by source
- [x] 7.4 `openspec validate add-event-feed-collector --strict` — by inspection (CLI absent per the openspec-cli-absent memory): deltas well-formed, every requirement has ≥1 scenario
