## 1. Backend: per-repo event log service

- [x] 1.1 Add `RepoEventLog` singleton: `ConcurrentDictionary<repoId, RepoLog>`; each `RepoLog` holds a locked `List<EventRecord>`, a monotonic `_seq`, and a soft cap (500, trim chunk 100) that drops the oldest on overflow (mirrors the `RunSession` discipline)
- [x] 1.2 Define `EventRecord { Seq, At, Op, Phase, Title, Detail }` with `Op`/`Phase` as open strings (source-agnostic)
- [x] 1.3 `Emit(repoId, op, phase, title, detail)` assigns the next seq and appends; `Read(repoId, after)` returns events with `Seq > after` (full log when `after <= 0`) plus `LastSeq`; emission is best-effort (wrapped in try/catch — never throws into the caller)
- [x] 1.4 Register the service in DI (new `AddEventsModule`, wired in `EmbeddedApi.cs`)

## 2. Backend: read endpoint

- [x] 2.1 `GET /api/repos/{repoId}/events?after=N` → `{ events: [...], lastSeq }` (full retained log when `after` absent/-1); behind normal session auth, no autopilot gate (`RepoEventsController`)
- [x] 2.2 `repoId` is taken from the path (the lane knows its own repo id) — explicit, so two docks on one repo read the same log

## 3. Backend: instrument discovery / run / check (emit only)

- [x] 3.1 Discovery: emit `started` in `LocalAppDiscoveryJobs.StartNew` (before the gateway call); terminal in the background task after `MarkDone` (detail includes app count) / `MarkError`; joining an in-flight job does NOT call `StartNew`, so no duplicate `started`
- [x] 3.2 Run: emit `started`/`done`/`error` around `LocalAppRunner.Launch` in the run endpoint ("launching <app> on :<port> (detached)…" → "launch issued — port liveness is read separately")
- [x] 3.3 Check: emit `started`/`done` for an explicit probe. Implemented via `discover/status?probe=true` (the manual "Check running" press / post-Run auto-check sets it); the background ~5s status poll omits `probe`, so it never emits — the log isn't flooded. Detail summarises which discovered ports are live
- [x] 3.4 No behavioural change to the instrumented operations — emit calls are additive and best-effort

## 4. Frontend: Console lane

- [x] 4.1 Console `phone__lane` button in `PinnedAgent.jsx` beside Builder/Ask/Files, gated by `eventConsole` (default `'advanced'` in `UiModeContext.jsx`); lane swaps `phone__screen` to `<EventConsole>` and hides the discover/git furniture like the Files lane does
- [x] 4.2 `EventConsole` component scoped by `repoId`: polls `/api/repos/{repoId}/events?after=N` every 5s while shown, advances the watermark by `lastSeq`, renders events chronologically (newest at bottom, auto-scroll), keeps prior events on a transient fetch error
- [x] 4.3 i18n keys (`console.*`) in `en.json` + `tr.json`; `evc__*` styles in `dashboard.css`

## 5. Understanding app + docs

- [x] 5.1 Rebuilt `understanding-app/index.html` (build-less, self-contained, relative URLs) for the event-log flow: the boundary rule (what we log vs the gateway black box), a live emit→ring→poll→render demo, the architecture, and the design decisions — browser-verified
- [x] 5.2 No convention changed; the "emit at the harness boundary" idea is documented in the Understanding app and the design. No `plan.md` edits (frozen)

## 6. Verify

- [x] 6.1 `npm --prefix client run build` + .NET `dotnet build -c Release` both clean (4 pre-existing CliRunnerService warnings only)
- [x] 6.2 Backend on isolated `:5201` (`verify-event-console-api.mjs`, 7 checks): fresh read empty/lastSeq 0; a probe emits `check` started+done; `?after=-1` returns the full log; `?after=lastSeq` drains to empty; `?after=1` returns only the newer event; a second probe appends with monotonic seq (3,4); the background poll (no probe) emits nothing
- [x] 6.3 Frontend (`verify-event-console-ui.mjs`, Playwright on `:5201`, dock isolation — own two tabs on SELF, deleted in finally): Console lane present in Advanced mode; opening it renders the seeded `check` events; a second dock on the same repo shows the same log (per-repo scope); a fresh probe appears on the next poll (live update). Events were seeded via the probe path rather than a real gateway discovery, so the discovery emit points are covered by 6.2's code path, not a live agent run
- [x] 6.4 `openspec validate agent-dock-event-console --strict` → valid
