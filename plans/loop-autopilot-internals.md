# Loop autopilot — build internals

> Subdoc of **[loop-autopilot.md](loop-autopilot.md)**. The mechanics:
> architecture, where it plugs into existing code, and how it's verified.
> (Decision logic is [the brain](loop-autopilot-brain.md); the fences are
> [safety](loop-autopilot-safety.md).)

## Architecture

```
AutopilotService (BackgroundService — the engine)
   ├─ find idle agents + last message ──▶ RunSessionService (/api/runs + transcripts)
   ├─ classify: routine prompt or escalate ──▶ Brain (LLM, fixed label set)
   │        └─ label space comes from ──▶ PromptsService (/api/prompts) + decision log
   ├─ read threshold / deny-list / enable ──▶ autopilot.json (%APPDATA%\ClaudeWeb)
   ├─ expose per-agent state ──▶ /api/autopilot ──▶ Dashboard docks (cue + escalate)
   └─ send (gated) ──▶ Chat-send path (ChatController) ──▶ Peer agent run
                         └─ every send appended to ──▶ audit log
```

## Where it plugs in (confirm against the code during build)

| Concern | Likely file | Note |
|---|---|---|
| Idle vs running agents | `Services/Run/RunSessionService.cs` + `/api/runs` | "idle" = finished its last turn |
| Each agent's last message | the per-repo event buffer behind `/api/chat/stream` | the situation the brain classifies |
| Routine-prompt label set | `Services/Prompts/PromptsService.cs` + `/api/prompts` | the user's custom prompts seed the set |
| **Decision log (new)** | append-only JSON in `%APPDATA%\ClaudeWeb` | `(agent state → prompt sent)` pairs; the training/eval data — **start logging in Slice 1** |
| The loop | new `Services/Autopilot/AutopilotService.cs` (`BackgroundService`) | the [engine](loop-autopilot-engine.md); per-agent verdicts in memory |
| The brain | new `Services/Autopilot/PromptClassifier.cs` | LLM call, fixed label set + confidence |
| API | new `Controllers/AutopilotController.cs` | `GET /api/autopilot` (state) · `POST /api/autopilot/config` (enable / threshold / deny-list) · the confirmed set |
| Auto-send | existing chat-send path in `ChatController` | post the chosen prompt to a peer's `(repo, lane)` run |
| Dock cue + escalate + toggle | `client/src/components/dashboard/PinnedAgent.jsx` + new badge + `dashboard.css` | sibling of the ⏳/⭐ cues; shows "auto-advancing" vs "needs you" |
| Config + audit persistence | `autopilot.json` + audit log in `%APPDATA%\ClaudeWeb` | same pattern as dock/notes/deploy ledger |

## Verification

Browser-verified on an isolated :5210 instance per
`docs/claude-web/browser-testing.md`. Seed fake peers by their last message:

- **routine** ("Build done — want me to play it back?") with a confident match to a
  routine prompt → auto-advances (Slice 3) / pre-fills it (Slice 2).
- **hard decision** ("Two valid schemas — which do you want?") → **escalates**, no
  auto-send.
- **risky** ("Shall I force-push to main?") → escalates even if confidently a
  "yes"-type routine → deny-list.
- **low confidence** → escalates.

Assert: routine turns advance, hard/risky/low-confidence turns escalate and are
**never** auto-sent, the audit log records each auto-send, and the kill switch
reverts everything to manual. Tests create/clean their own dock tabs +
`autopilot.json` (shared `%APPDATA%` store — see the dock-sync test gotchas).
