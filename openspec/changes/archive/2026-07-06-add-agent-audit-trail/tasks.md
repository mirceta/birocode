# Tasks: add-agent-audit-trail

## 1. Backend store and DI

- [x] 1.1 Create `ClaudeWeb.App/Services/AgenticAudit/AgenticAuditLog.cs` — thread-safe append-only JSONL store at `AppPaths.DataDir/agentic-audit.jsonl` (modeled on `AutopilotAuditLog`): entry record (ts, kind `started|done|error|canceled`, callId, feature, repoId, repoName, actor, ip, durationMs?, error?), `RecordStart(...)` returning the callId, `RecordEnd(...)`, `Recent(max)` skipping corrupt lines
- [x] 1.2 Create `Services/AgenticAudit/AgenticAuditModuleExtensions.cs` (singleton registration) and wire it in `Program.cs` alongside the other modules

## 2. Emit from the two agentic features

- [x] 2.1 `LocalAppsController` (`GET /discover`): resolve the actor via `AuditService.ResolveActor(HttpContext)` and pass actor display + IP into `LocalAppDiscoveryJobs.StartOrJoin`
- [x] 2.2 `LocalAppDiscoveryJobs`: on an actual start (not a join), call `RecordStart(feature: "discover-local-apps", ...)`; on terminal state inside the job task, call `RecordEnd` with outcome, duration, and trimmed error — alongside the existing `RepoEventLog.Emit`
- [x] 2.3 Same pair for understanding: `UnderstandingController` (`POST /ask`) resolves and passes the actor; `UnderstandingJobs` records start (feature `ask-for-understanding`) and terminal
- [x] 2.4 Verify a join (second call while running) records nothing, and cancellation records `canceled`

## 3. Read API

- [x] 3.1 Create `Controllers/AgenticAuditController.cs` — `GET /api/agentic-audit?feature=&repo=&outcome=&limit=` only (no mutating verbs): merge start/terminal entries by callId newest-first; mark started-without-terminal as `running` when the matching job registry has a live job for that repo, else `interrupted`
- [x] 3.2 Manual check: entries survive a harness restart; pre-restart orphaned start shows `interrupted`

## 4. Frontend trail view

- [x] 4.1 Add `agenticAudit: 'advanced'` to the capability map in `client/src/context/UiModeContext.jsx`
- [x] 4.2 Create the "Agent audit" dashboard panel component: table newest-first (feature, repo, actor, started, outcome/duration), filters for feature / repo / outcome, 5s polling while any call is running, no edit/delete affordances
- [x] 4.3 Mount it on the dashboard behind `useFeature('agenticAudit')` (settle exact placement next to the existing Activity area at implementation time)
- [x] 4.4 Add i18n strings to `client/src/i18n/en.json` and `tr.json`

## 5. Verify and close out

- [x] 5.1 `npm --prefix client run build` and isolated backend build per `docs/claude-web/self-dev.md`; drive both buttons end-to-end and confirm the trail shows both runs with correct actor/repo/outcome (browser-verify per `docs/claude-web/browser-testing.md`)
- [x] 5.2 `openspec validate add-agent-audit-trail --strict` passes
