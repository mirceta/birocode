## 1. Store: pinned session on the loop record

- [x] 1.1 `LoopConfigStore`: additive nullable `SessionId` on `Entry` + `LoopState`, threaded through `ToState`; `SetSessionId(repoId, sessionId)` (idempotent save); `Start`/`StartGoal` accept an optional pin
- [x] 1.2 `AutopilotController`: `LoopRequest` gains optional `SessionId`, passed on start; gated detail + debug projections disclose the pin

## 2. Engine: pinned read, pinned resume, lineage advance

- [x] 2.1 `AutopilotService`: `LastAssistantMessageIn(repoPath, sessionId)`; driven kinds read reply + resume target from the pin (newest-file fallback only while the pin is null, then locked in by the first send); suggestion kind unchanged
- [x] 2.2 Subscribe to `RunSessionService.RunCompleted`: builder-lane completion with a session id + active driven loop → `SetSessionId` (advance the pin)

## 3. Kinds: final-line completion tokens

- [x] 3.1 `ILoop.SentinelHit` + `GoalLoop` `GOAL_VERIFIED` check anchor to the reply's final non-empty line (case-insensitive; NEEDS_HUMAN/deny-list unchanged); note the enforcement in `docs/loop-driven-agent-convention.md`

## 4. Client: arm with the conversation, discover engine runs

- [x] 4.1 `DockLoopControl` arm call passes the dock conversation's session id
- [x] 4.2 `ChatContext`: ~5s visible-page poll invoking `reconcile()` (skip when hidden, start after `dockLoaded`)

## 5. Verify

- [ ] 5.1 Isolated-port backend e2e: loop follows its own resume fork; a newer unrelated session with a quoted sentinel neither resolves nor advances the loop; final-line sentinel still completes
- [ ] 5.2 Playwright on isolated port: open visible dock attaches to an engine-started run (bubbles + Stop) without refresh; no double-attach
- [ ] 5.3 `openspec validate fix-loop-conversation-identity --strict` + builds green + understanding-app honesty pass
