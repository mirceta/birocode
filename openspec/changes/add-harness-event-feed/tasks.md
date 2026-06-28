# Tasks

## 1. Backend: harness event feed service

- [ ] 1.1 Add `Services/Events/HarnessEventFeed.cs` — in-memory, bounded ring buffer,
      harness-wide monotonic `seq`, thread-safe append, watermark read returning
      `(events, lastSeq)`. Define the envelope (`Seq`, `At`, `Type`, `Source`, `Data`)
      and the `turn.ended` payload. Mirror the proven `RepoEventLog` pattern.
- [ ] 1.2 Register it as a singleton (extend the events module extension /
      `EmbeddedApi.cs` registration) so controllers and `CliRunnerService` can inject it.

## 2. Backend: read-only REST endpoint

- [ ] 2.1 Add `Controllers/HarnessEventsController.cs` — `GET /api/events?after=N`
      returning `{ events, lastSeq }`. Read-only, no side effects; inherits
      `PasswordAuthMiddleware`. `after` default `-1` = full retained feed.
- [ ] 2.2 Confirm no new action/mutation endpoint is introduced anywhere in the change.

## 3. Backend: publish turn.ended

- [ ] 3.1 Inject `HarnessEventFeed` into `Services/Chat/CliRunnerService.cs`; at the
      existing turn-end point (`HandleResult` done/error path) publish a `turn.ended`
      event with repo source + `{ sessionId, status, costUsd?, numTurns? }`.
- [ ] 3.2 Make publishing best-effort (try/catch, swallow) so it can never disrupt a run.

## 4. Pilot consumer app (in-repo test bed)

- [ ] 4.1 Add a build-less, self-contained static app folder at the repo root
      (working name `events-app/`, `index.html` + vendored JS/CSS, relative URLs only).
- [ ] 4.2 App polls `GET /api/events?after=watermark`, advances the watermark, renders
      the event stream **generically from the envelope** (shows `type`, `source`, time,
      payload; highlights `turn.ended`) so it also tests future event types.
- [ ] 4.3 Serve it through the existing local-app mechanism (synthetic `kind:harness`
      app via `RepositoryRegistry` / `LocalProxyController`, or a registered local app —
      whichever the local-exposure contract makes cleanest). Obey
      `docs/local-exposure-convention.md`.

## 5. Verify (headless browser + curl)

- [ ] 5.1 Build frontend + run harness on an isolated preview port with its own datadir.
- [ ] 5.2 `curl`/Playwright: `GET /api/events` requires auth; with auth returns
      `{ events, lastSeq }`; watermark paging returns only newer events on the second
      poll.
- [ ] 5.3 Drive one chat turn to completion (and one to error if feasible); confirm a
      `turn.ended` event appears in the feed with the right repo/session/status.
- [ ] 5.4 Open the pilot app on the Local tab; confirm it shows the `turn.ended` event
      arriving on its next poll, and renders an unknown/synthetic `type` generically.
- [ ] 5.5 Confirm existing per-repo `/api/repos/{id}/events` + Event Console are
      unaffected.

## 6. Understanding app + validate

- [ ] 6.1 Author/refresh `understanding-app/index.html` explaining the feed (pilot →
      future collector), the envelope/extension point, the read-only constraint, and the
      turn-ended flow.
- [ ] 6.2 `openspec validate add-harness-event-feed --strict` passes.
