## 1. Backend

- [x] 1.1 `AppBuildKind` + `IConversationAppBuilder` + `ConversationAppBuild` (shared
      transcript → prompt → run step); `UnderstandingAsk` on it, `GoalAsk` with the goal
      prompt.
- [x] 1.2 `UnderstandingJobs` keyed by (kind, repo); understanding-only overloads kept.
- [x] 1.3 `AutoUnderstandingTrigger` reads `AutoUnderstanding` and `AutoGoal`
      (`KindsToRun`); `RepositoryConfig.AutoGoal`; `RepositoryRegistry.SetAutoGoal`.
- [x] 1.4 `GoalApp` static server over `goal-app/`; `GoalAppId = "goal"` appended to every
      repo; `LocalProxyController` dispatch; DI in `EmbeddedApi` / the module extension.
- [x] 1.5 `GoalController` (`/api/goal/ask|status|auto`); `AgenticAuditController`
      resolves live jobs by kind.
- [x] 1.6 Tests: `GoalAppTests` (kinds, prompts, turn-end rule, flag default, registry
      refuses an unregistered kind).

## 2. Client

- [x] 2.1 `useAppBuild` hook; `PinnedAgent` renders 🧠 + Auto and 🎯 + Auto in one row,
      each behind its capability; `goalAgent` (Advanced) in `UiModeContext`.
- [x] 2.2 i18n (en, tr) `dashboard.goal*`, `audit.feature.goal`; `AgentAuditPanel`
      lists `update-goal`.
- [x] 2.3 Bundles rebuilt (harness client + Management App).

## 3. Convention + repo

- [x] 3.1 "The Goal app" section in `docs/understanding-app-convention.md`; a pointer
      paragraph in `CLAUDE.md`.
- [x] 3.2 `goal-app/` gitignored on birocode.

## 4. Verify

- [x] 4.1 `dotnet test` + `npm test` green on the branch.
- [x] 4.2 Isolated instance (`.claudeweb-preview/goal-app-e2e.ps1` →
      `playwright/check-goal-app.mjs`): every repo lists local app `goal`; the Goal slot
      serves the empty state; `/api/goal/status` idle; the Auto flag round-trips and
      persists in the iso data dir; ask without a conversation is a friendly 400; the
      dock shows 🎯 Update goal + Auto right next to 🧠 + Auto; screenshot.
- [ ] 4.3 First real run on a dock conversation (needs a paid subagent turn — the
      Operator's call after merge).
