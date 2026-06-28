# Tasks

## 1. Backend: harness event feed service

- [x] 1.1 Add `Services/Events/HarnessEventFeed.cs` — in-memory, bounded ring buffer,
      harness-wide monotonic `seq`, thread-safe append, watermark read returning
      `(events, lastSeq)`. Define the envelope (`Seq`, `At`, `Type`, `Source`, `Data`)
      and the `turn.ended` payload. Mirror the proven `RepoEventLog` pattern.
- [x] 1.2 Register it as a singleton (extend the events module extension /
      `EmbeddedApi.cs` registration) so controllers and `CliRunnerService` can inject it.
      (Added to `EventsModuleExtensions.AddEventsModule`, alongside `EventsApp`.)

## 2. Backend: read-only REST endpoint

- [x] 2.1 Add `Controllers/HarnessEventsController.cs` — `GET /api/events?after=N`
      returning `{ events, lastSeq }`. Read-only, no side effects; inherits
      `PasswordAuthMiddleware`. `after` default `-1` = full retained feed.
- [x] 2.2 Confirm no new action/mutation endpoint is introduced anywhere in the change.
      (Only a single `[HttpGet]` was added; no POST/PUT/PATCH/DELETE.)

## 3. Backend: publish turn.ended

- [x] 3.1 Inject `HarnessEventFeed` into `Services/Chat/CliRunnerService.cs`; publish a
      `turn.ended` event with repo source + `{ sessionId, status, costUsd?, numTurns?,
      readOnly }`. **Refinement vs design:** published in `RunAsync`'s `finally`, not
      only `HandleResult` — the one chokepoint hit by every terminal path (normal, CLI
      error, non-zero exit, cancel, exception), so it fires exactly once with the
      finalized `record`. `repoId`/`repoName` threaded in from `ChatController`.
- [x] 3.2 Make publishing best-effort (try/catch, swallow) so it can never disrupt a run.
      (`HarnessEventFeed.Publish` swallows internally; the call site cannot throw.)

## 4. Pilot consumer app (in-repo test bed)

- [x] 4.1 Add a build-less, self-contained static app folder at the repo root
      (`events-app/index.html`; fully self-contained inline JS/CSS, no external libs —
      relative URLs only).
- [x] 4.2 App polls `GET /api/events?after=watermark`, advances the watermark, renders
      the event stream **generically from the envelope** (shows `type`, `source`, time,
      payload; highlights `turn.ended`) so it also tests future event types.
- [x] 4.3 Serve it through the existing local-app mechanism: synthetic `kind:harness`
      app `events-feed` on the self repo (like the Lab) via `RepositoryRegistry`
      (`EventsAppId`) + `LocalProxyController` dispatch to new `EventsApp`. API base
      derived from the app's own URL so it works behind any proxy prefix (obeys
      `docs/local-exposure-convention.md`).

## 5. Verify (headless browser + curl)

- [x] 5.1 Ran the freshly-built harness on isolated port :5098 (live datadir, side
      port) — booted healthy, which also proves DI resolves the new `HarnessEventFeed`
      dependency on `CliRunnerService`.
- [x] 5.2 `verify-harness-event-feed.mjs` (PASS): `GET /api/events` requires auth;
      authed returns `{events:[], lastSeq:0}` with correct shape; watermark drains;
      `POST /api/events` is 404/405 (no action surface); per-repo console untouched.
- [x] 5.3 `driver-turn-ended.mjs` (PASS): drove one minimal read-only turn →
      `turn.ended` landed with `source.repoId/repoName`, `data.status:done`,
      `sessionId`, `costUsd`, `numTurns`, `readOnly:true`; watermark drains past it;
      the per-repo Event Console did NOT receive the turn-lifecycle event.
- [x] 5.4 `verify-events-app-ui.mjs` (PASS) + screenshot `.claudeweb-preview/
      events-app-ui.png`: the consumer app loads through the localview proxy, polls,
      and renders the `turn.ended` row (type/source/status badge), no page errors.
      Generic-envelope rendering of unknown `type`s is implemented (the renderer
      switches on known types and falls back to printing the raw envelope+data).
- [x] 5.5 Confirmed existing per-repo `/api/repos/{id}/events` still returns the right
      shape and is free of turn-lifecycle events. Isolated harness stopped; live :5099
      untouched (health 200).

## 6. Understanding app + validate

- [x] 6.1 `understanding-app/index.html` authored: five views (the ask; pilot vs
      future collector; an interactive turn-ended flow simulator; the envelope/
      extension point; the read-only + no-new-actions constraints).
- [x] 6.2 `openspec validate add-harness-event-feed --strict` passes.
