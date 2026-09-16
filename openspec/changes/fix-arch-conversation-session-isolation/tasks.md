## 1. Build

- [x] 1.1 `AutopilotService.TickRepo`: arch keys resolve their session through
      `ResolveArchSessionId` only; the folder-newest fallback stays repo-dock-only.
- [x] 1.2 `ArchAgentService`: `ResolvesSessionFromNewestTranscript`; `ResolveArchSessionId`
      drops a pin naming a sibling's session; `NoteArchSession` refuses a session another
      conversation owns; `RepairSharedSessions`.
- [x] 1.3 `ArchStateStore`: `OwnerOfSession`, `SplitSharedSessions`.
- [x] 1.4 Engine tick: `RepairSharedSessions` before `PolicemanTick`.
- [x] 1.5 Tests: `ArchConversationSessionIsolationTests`.

## 2. Verify

- [x] 2.1 `openspec validate fix-arch-conversation-session-isolation --strict`; .NET suite green.

## 3. Ship

- [ ] 3.1 PR against main; merge + deploy on the Operator's word (the repair heals the live
      store on the first engine tick after deploy).
