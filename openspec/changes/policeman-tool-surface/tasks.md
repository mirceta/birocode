## 1. Build

- [x] 1.1 `ArchMcpServer.ToolsList(conversation)` + `WithheldTools(conversation)`; `tools/list` and
      `initialize` answer per conversation.
- [x] 1.2 `ArchAgentService.DisallowedToolsFor(key)`; used on operator turns and loop-driven turns.
- [x] 1.3 `GET /api/arch/tools?conv=` → `conversation`, `policy`, `tools` (offered), `withheldTools`,
      `catalogueCount`, usage filtered by conversation.
- [x] 1.4 `ArchToolsPanel({ conv })` with the observe-only pill, intro and withheld section; `Arch.jsx`
      passes `conv`; `PolicemanPanel` wording points at the lane.

## 2. Verify

- [x] 2.1 `ArchPolicemanTests`: tools/list per conversation, the CLI fence; full backend suite green.
- [x] 2.2 Evidence `shot-kanban-policeman-conversation.mjs`: the Tools lane inside the policeman subtab is
      observe-only, offers exactly the subset, names the withheld; screenshot `kanban-policeman-tools.png`.
- [x] 2.3 Management App bundle rebuilt.

## 3. Ship

- [ ] 3.1 PR against main; merge + deploy on the Operator's word.
