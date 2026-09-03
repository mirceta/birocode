## 1. Server — transcript cache

- [x] 1.1 `Services/Chat/TranscriptCache.cs`: per-path incremental reader (whole
      lines only, stat short-circuit, shrink/rewrite reset, LRU 24, per-entry lock).
- [x] 1.2 Refactor `SessionService` parsers into `MessagesAcc`, `ToolCallsAcc`,
      `ToolHistoryAcc`; `GetMessages` / `GetToolCalls` / `GetToolCallHistory` read
      through the cache; `ReadMessagesUncached` for mining; metadata cache for
      `ListSessions`.
- [x] 1.3 `GET /api/sessions/activity?ids=repoId:sessionId,…` in `ChatController`
      (batch → activity, lastUserAt, count). GET rather than POST so read-only
      guests keep the dashboard.
- [x] 1.4 `AutopilotAuditLog`: in-memory entries, write-through `Record`.

## 2. Server — mining, git, writers

- [x] 2.1 `AutopilotDiscoveryService`: per-file contribution cache keyed by
      (length, mtime); skip unchanged; drop vanished.
- [x] 2.2 `GitService.Status` memo (5 s, single-flight, invalidated by mutating
      actions) + `RunGit` semaphore.
- [x] 2.3 `ArchAgentService.RemoteUrl` memo (60 s); `GitHubAccountService`
      TTL 5 min; `ClaudeAccountService` TTL 1 min.
- [x] 2.4 `Logger` + `AuditService` keep their file handle open.

## 3. Client

- [x] 3.1 `ChatContext.loadTranscript` in-flight guard per (key, sessionId).
- [x] 3.2 `Dashboard.jsx` poll uses `GET /api/sessions/activity` once per tick.
- [x] 3.3 `Arch.jsx`, `ArchHistoryPanel.jsx`, `ArchToolsPanel.jsx`: hidden guards;
      messages polled only on the Chat lane; sessionId from `/arch` state.

## 4. Verification

- [x] 4.1 `tests/ClaudeWeb.Tests/TranscriptCacheTests.cs` (9 tests): unchanged → no
      re-parse; append → delta only; partial trailing line not consumed until
      terminated; shrink → full re-parse; same-length rewrite → re-parse; late
      tool_result pairs with earlier tool_use across an append; activity digest;
      missing file; metadata cache.
- [x] 4.2 `dotnet test` green (192/192); isolated `vite build` clean;
      `openspec validate reduce-transcript-io --strict` passes.
- [x] 4.3 A/B on 2026-09-03 with `.claudeweb-preview/playwright/measure-transcript-io.mjs`:
      two isolated instances (the live build vs this branch), the real 262 MB
      transcript bound to a dock, dashboard overlay open for 20 s —
      old: 997 MB read / 255k read ops / 4 transcript GETs (12.9 MB over the wire);
      new: 0 MB / 0 ops / 4 batch activity GETs. Chat page idle: 0.4 MB on both
      (the running-run reattach path is not reproducible in an isolated instance).
- [x] 4.4 Understanding app updated: fixes → implemented, with the measurement.
- [ ] 4.5 Live (after deploy): ClaudeWeb.exe read bytes over 10 s with the chat
      and dashboard open drops from ~500 MB to single-digit MB; git.exe count in
      an arch tick stays flat.
