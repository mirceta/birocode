## 1. Backend: backend-owned discovery registry

- [x] 1.1 Add `LocalAppDiscoveryJobs` singleton service with a per-repo `ConcurrentDictionary<repoId, DiscoveryJob>`; `DiscoveryJob` holds `Status (Running|Done|Error)`, `Result`, `Error`, `StartedAt`, `FinishedAt`, backing `Task` + own `CancellationTokenSource`
- [x] 1.2 Implement `StartOrJoin(repoId, path)`: join the existing job if Running, else create one and run `DiscoverAsync` on a background task with the job's OWN token (never the request token); store latest-only per repo (overwrite on next start)
- [x] 1.3 Register the service in DI

## 2. Backend: endpoints (start-or-join + status)

- [x] 2.1 `LocalAppsController.Discover`: stop passing `HttpContext.RequestAborted` into the run; call `StartOrJoin` and return current state (running, or the just-finished `{ repoId, repoName, apps }`) — keep the completed-shape backward-compatible
- [x] 2.2 Add `GET /api/local-apps/discover/status` returning `{ status, apps?, error?, startedAt, finishedAt }` for the caller's repo (resolved by `X-Repo-Id`/`?repo=`)

## 3. Backend: per-call gateway identity (concurrency metadata fix)

- [x] 3.1 Thread a distinct per-call identity/correlation id from `StructuredAskRunner` → `ClaudeMonitor.Client` → gateway request (e.g. unique app name `claudeweb-structured-ask#<callId>`) — **done via Option A**: `StructuredAskRunner` sends a unique app name per call (`claudeweb-structured-ask#<GUID>`)
- [x] 3.2 ~~In `EmbeddedApi`, resolve the response record by that identity~~ — **not needed under Option A**: the gateway's existing `FindLatestRecord(app)` keys on the app name, so a per-call-unique name already resolves the call's own record. Zero gateway/client edits (avoids a cross-repo `birokrat-ai-platform` change + `:5123` redeploy). See design Open Questions.

## 4. Frontend: reattach-on-mount + poll-while-running

- [x] 4.1 `PinnedAgent.jsx`: on mount/repo-change, GET `/local-apps/discover/status`; render running (spinner) / done (apps) / error from server state instead of fire-and-forget local state
- [x] 4.2 Discover button → start endpoint, then poll status until terminal at the existing ~5s dock cadence; drive result display from server state so a refresh re-derives it
- [x] 4.3 Preserve the existing register-app flow and `localApps`-derived "✓ Registered" rows unchanged

## 5. Understanding app + docs

- [x] 5.1 Author/refresh `understanding-app/index.html` (build-less, vendored, relative URLs) for the backend-owned discovery + reattach flow
- [x] 5.2 Confirm CLAUDE.md/docs references stay accurate (no `plan.md` edits — frozen) — no convention changed; nothing to edit

## 6. Verify

- [x] 6.1 Build frontend (`npm --prefix client run build`) + .NET build clean — both green (4 pre-existing CliRunnerService warnings only)
- [x] 6.2 Verified on isolated build (`:5201`, shared read-only datadir). **Backend** (`verify-discover-resilient.mjs`): `GET /discover` returns `running` in 77ms (non-blocking), a *separate* `GET /discover/status` reattaches and polls through to `done` with the apps array + `finishedAt` (so a refresh re-derives state — the agent call is never wasted); an unstarted repo reads `idle`. **Frontend** (`verify-discover-reattach-ui.mjs`, Playwright, status stubbed — no agent run): reattach-on-mount renders the discovered apps with no click, and reattach-on-reload shows the busy Discover button for a running scan with no stale list.
- [x] 6.3 Concurrency: fired two repos at once; the gateway recorded **distinct per-call app names** (`claudeweb-structured-ask#<id>` ×3, one per scan, none bare), proving each call resolves its own record — no cross-wiring.
- [x] 6.4 `openspec validate discover-local-apps-resilient --strict` → valid
