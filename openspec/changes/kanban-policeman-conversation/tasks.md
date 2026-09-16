## 1. Build

- [x] 1.1 `ArchPoliceman` (pure): reserved id/name, sentinel, allowed tools + refusal, the ritual
      prompt with the board goal, `NeedsRollover`, `Handover` / `VerdictSummary`, settings bounds.
- [x] 1.2 `ArchStateStore`: `EnsureConversation(id, name)`; policeman section — enabled, interval,
      cap, rollovers, restarts, last context, turns, sessions (open/close by id), pending handover.
- [x] 1.3 `RunSession.LastContextTokens` from `usage.contextTokens`.
- [x] 1.4 `ArchMcpServer`: `Handle(body, conversation)`; observe-only refusal for the policeman;
      `board_integrity`, `flag_needs_human`, `clear_needs_human` in the catalogue and dispatch.
- [x] 1.5 `ArchAgentService.Policeman`: status, start (recipe loop), stop, check now, settings,
      tick (re-arm on capped/done/error-after-cooldown; disable on the Operator's Stop; keep the
      prompt in step with the goal), after-turn accounting + rollover with handover, the tools;
      `DrivenQuietFloorFor`; `BuildMcpConfigJson(convKey)`; handover prefix on driven and
      Operator sends.
- [x] 1.6 `ArchController`: `GET /api/arch/policeman`, `POST …/start|stop|check|rollover|settings`;
      `conv` on the MCP URL; `policeman` flag on conversation views.
- [x] 1.7 `AutopilotService`: `PolicemanTick` on the engine tick; per-key quiet floor;
      conversation-tagged MCP config for arch sends.
- [x] 1.8 Client: `PolicemanPanel` (control strip, settings, meter, verdict, prompt, tools,
      sessions strip, past-session history, the embedded Arch page) + `KanbanTab` subtabs;
      `Arch.jsx` reserved-conversation handling; `ArchHistoryPanel.sessionOverride`;
      `ManageApp` hides the policeman from the sibling strip.
- [x] 1.9 Tests: `ArchPolicemanTests`; tool-count assertions → 27.

## 2. Verify

- [x] 2.1 `openspec validate kanban-policeman-conversation --strict`; .NET + client suites green;
      headless evidence (`client/tests/ui/shot-kanban-policeman-conversation.mjs`) → screenshots of
      the Policeman subtab (control strip + sessions + conversation) and a past session's history.

## 3. Ship

- [ ] 3.1 On PR #100 (fleet task b2ea0809); merge and deploy on the Operator's word.

## 4. Follow-up

- [ ] 4.1 An "ask the policeman about this card" shortcut on a Kanban card.
- [ ] 4.2 Let the arch's `list_arch_goals`-style tool list the policeman's status for the
      Operator-facing conversation.
